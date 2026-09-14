alter table public.pricing_settings
  add column if not exists competitor_ai_supervisor_enabled boolean not null default true,
  add column if not exists competitor_ai_dry_run boolean not null default true,
  add column if not exists competitor_ai_min_confidence numeric not null default 0.85 check (competitor_ai_min_confidence between 0 and 1),
  add column if not exists competitor_ai_review_freshness_hours integer not null default 48 check (competitor_ai_review_freshness_hours between 1 and 168),
  add column if not exists competitor_ai_min_verified_competitors integer not null default 2 check (competitor_ai_min_verified_competitors between 1 and 10);

create table if not exists public.competitor_ai_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','completed','failed')),
  scope text not null default 'primary_market',
  requested_by text not null default 'shruthi-market-supervisor',
  model text,
  products_analyzed integer not null default 0,
  keep_count integer not null default 0,
  reduce_count integer not null default 0,
  increase_count integer not null default 0,
  investigate_count integer not null default 0,
  ai_reviewed_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.competitor_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.competitor_ai_runs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  action text not null check (action in ('KEEP','REDUCE','INCREASE','INVESTIGATE')),
  confidence numeric not null check (confidence between 0 and 1),
  current_price numeric,
  cost_price numeric,
  profit_floor_price numeric,
  lowest_competitor_price numeric,
  median_market_price numeric,
  average_market_price numeric,
  highest_competitor_price numeric,
  competitor_count integer not null default 0,
  suggested_price numeric,
  market_position text,
  reason text not null,
  risk_flags text[] not null default '{}'::text[],
  evidence jsonb not null default '{}'::jsonb,
  competitor_data_age_hours numeric,
  ai_used boolean not null default false,
  ai_model text,
  review_status text not null default 'pending' check (review_status in ('pending','promoted','dismissed','superseded')),
  requires_approval boolean not null default true,
  pricing_suggestion_id uuid references public.pricing_suggestions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, product_id)
);

create index if not exists competitor_ai_runs_started_idx on public.competitor_ai_runs(started_at desc);
create index if not exists competitor_ai_reviews_product_created_idx on public.competitor_ai_reviews(product_id, created_at desc);
create index if not exists competitor_ai_reviews_status_action_idx on public.competitor_ai_reviews(review_status, action, created_at desc);
create index if not exists competitor_ai_reviews_run_idx on public.competitor_ai_reviews(run_id);

alter table public.competitor_ai_runs enable row level security;
alter table public.competitor_ai_reviews enable row level security;
revoke all on public.competitor_ai_runs from anon;
revoke all on public.competitor_ai_reviews from anon;
grant select, insert, update on public.competitor_ai_runs to authenticated;
grant select, insert, update on public.competitor_ai_reviews to authenticated;

drop policy if exists competitor_ai_runs_admin on public.competitor_ai_runs;
create policy competitor_ai_runs_admin on public.competitor_ai_runs for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists competitor_ai_reviews_admin on public.competitor_ai_reviews;
create policy competitor_ai_reviews_admin on public.competitor_ai_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.promote_competitor_ai_review_to_pricing_approval(
  p_review_id uuid,
  p_requested_by text default 'shruthi-market-supervisor'
)
returns json
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  r record;
  p record;
  s record;
  f record;
  existing_id uuid;
  suggestion_id uuid;
  expected_margin numeric;
  price_diff numeric;
  pct_diff numeric;
  financial_age numeric;
  competitor_age numeric;
  pricing_state text;
  optimization_action_value text;
  quality record;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  select * into r from public.competitor_ai_reviews where id=p_review_id for update;
  if not found then return json_build_object('success',false,'error','AI review not found'); end if;
  if r.review_status <> 'pending' then return json_build_object('success',false,'error','AI review is not pending'); end if;
  if r.action not in ('REDUCE','INCREASE') or r.suggested_price is null or r.suggested_price <= 0 then
    return json_build_object('success',false,'error','Only a concrete REDUCE or INCREASE recommendation can be promoted');
  end if;

  select * into s from public.pricing_settings where store_id is null order by updated_at desc nulls last limit 1;
  if not coalesce(s.competitor_ai_supervisor_enabled,true) then return json_build_object('success',false,'error','Competitor AI supervisor is disabled'); end if;
  if r.confidence < coalesce(s.competitor_ai_min_confidence,0.85) then return json_build_object('success',false,'error','AI confidence is below the configured promotion threshold'); end if;
  if r.created_at < now() - make_interval(hours => coalesce(s.competitor_ai_review_freshness_hours,48)) then
    return json_build_object('success',false,'error','AI review is stale; run market analysis again');
  end if;

  select id,name,price,cost_price,stock,is_active,is_deleted into p from public.products where id=r.product_id for update;
  if not found or not coalesce(p.is_active,false) or coalesce(p.is_deleted,false) then return json_build_object('success',false,'error','Product is not active'); end if;
  if p.price is distinct from r.current_price then return json_build_object('success',false,'error','Product price changed since AI review; run market analysis again'); end if;
  if p.cost_price is null or p.cost_price <= 0 then return json_build_object('success',false,'error','Product cost is missing; recommendation cannot enter approval queue'); end if;
  if r.suggested_price < p.cost_price then return json_build_object('success',false,'error','Suggested price is below cost'); end if;

  select * into f from public.v_pricing_financial_context where product_id=r.product_id limit 1;
  financial_age := case when f.financial_data_as_of is null then 999999 else extract(epoch from (now()-f.financial_data_as_of))/3600 end;
  competitor_age := coalesce(r.competitor_data_age_hours,999999);
  expected_margin := case when r.suggested_price > 0 then ((r.suggested_price-p.cost_price)/r.suggested_price)*100 else null end;
  price_diff := r.suggested_price-p.price;
  pct_diff := case when p.price > 0 then (price_diff/p.price)*100 else null end;
  pricing_state := case when f.financial_data_as_of is null or coalesce(f.expected_daily_units,0) <= 0 then 'WAIT_FOR_DEMAND_DATA' else 'READY_FOR_APPROVAL' end;
  optimization_action_value := case when pricing_state='WAIT_FOR_DEMAND_DATA' then 'COLLECT_MORE_DATA' else r.action end;

  select id into existing_id from public.pricing_suggestions
  where product_id=r.product_id and optimization_strategy='shruthi_competitor_supervisor'
    and approval_status='pending' and execution_status='not_executed'
  order by generated_at desc nulls last limit 1;

  if existing_id is null then
    insert into public.pricing_suggestions(
      product_id,current_price,suggested_price,cost_price,minimum_allowed_price,
      lowest_competitor_price,median_market_price,highest_competitor_price,
      strategy,expected_margin,price_difference,percentage_difference,recommendation_status,
      reason,generated_at,competitive_target_price,required_profit_price,final_price,
      decision_reason,competitor_data_age_hours,financial_data_age_hours,publication_status,
      market_position,in_stock_competitor_count,our_stock,profit_floor_price,recommended_price,
      expected_profit_per_unit,expected_daily_units,expected_daily_profit,pricing_status,
      competitor_data_quality,competitor_freshness_hours,requires_approval,price_locked,
      financial_data_as_of,financial_cost_per_unit,optimization_strategy,optimization_action,
      approval_status,execution_status,data_quality_status,data_quality_reasons,execution_blocked
    ) values (
      r.product_id,p.price,r.suggested_price,p.cost_price,r.profit_floor_price,
      r.lowest_competitor_price,r.median_market_price,r.highest_competitor_price,
      'moderate',expected_margin,price_diff,pct_diff,'ready',
      r.reason,now(),r.suggested_price,r.profit_floor_price,r.suggested_price,
      r.reason,competitor_age,financial_age,'pending',
      r.market_position,r.competitor_count,p.stock,r.profit_floor_price,r.suggested_price,
      r.suggested_price-p.cost_price,coalesce(f.expected_daily_units,0),(r.suggested_price-p.cost_price)*coalesce(f.expected_daily_units,0),pricing_state,
      'AI_SUPERVISED',competitor_age,true,false,
      f.financial_data_as_of,coalesce(f.financial_cost_per_unit,0),'shruthi_competitor_supervisor',optimization_action_value,
      'pending','not_executed','pending','[]'::jsonb,false
    ) returning id into suggestion_id;
  else
    update public.pricing_suggestions set
      current_price=p.price,suggested_price=r.suggested_price,cost_price=p.cost_price,
      minimum_allowed_price=r.profit_floor_price,lowest_competitor_price=r.lowest_competitor_price,
      median_market_price=r.median_market_price,highest_competitor_price=r.highest_competitor_price,
      strategy='moderate',expected_margin=expected_margin,price_difference=price_diff,percentage_difference=pct_diff,
      recommendation_status='ready',reason=r.reason,generated_at=now(),competitive_target_price=r.suggested_price,
      required_profit_price=r.profit_floor_price,final_price=r.suggested_price,decision_reason=r.reason,
      competitor_data_age_hours=competitor_age,financial_data_age_hours=financial_age,publication_status='pending',
      market_position=r.market_position,in_stock_competitor_count=r.competitor_count,our_stock=p.stock,
      profit_floor_price=r.profit_floor_price,recommended_price=r.suggested_price,
      expected_profit_per_unit=r.suggested_price-p.cost_price,expected_daily_units=coalesce(f.expected_daily_units,0),
      expected_daily_profit=(r.suggested_price-p.cost_price)*coalesce(f.expected_daily_units,0),pricing_status=pricing_state,
      competitor_data_quality='AI_SUPERVISED',competitor_freshness_hours=competitor_age,requires_approval=true,
      price_locked=false,financial_data_as_of=f.financial_data_as_of,financial_cost_per_unit=coalesce(f.financial_cost_per_unit,0),
      optimization_strategy='shruthi_competitor_supervisor',optimization_action=optimization_action_value,
      approval_status='pending',approved_at=null,approved_by=null,rejected_at=null,rejected_by=null,rejection_reason=null,
      execution_status='not_executed',execution_attempted_at=null,execution_error=null,
      data_quality_status='pending',data_quality_reasons='[]'::jsonb,data_quality_checked_at=null,execution_blocked=false
    where id=existing_id returning id into suggestion_id;
  end if;

  select * into quality from public.check_pricing_data_quality(suggestion_id);
  update public.competitor_ai_reviews set review_status='promoted',pricing_suggestion_id=suggestion_id,updated_at=now() where id=p_review_id;

  return json_build_object('success',true,'review_id',p_review_id,'pricing_suggestion_id',suggestion_id,
    'approval_status','pending','data_quality_status',quality.data_quality_status,
    'execution_blocked',quality.execution_blocked,'reasons',quality.data_quality_reasons,
    'message','Sent to Pricing Approval Centre; no price was changed.');
end;
$$;

grant execute on function public.promote_competitor_ai_review_to_pricing_approval(uuid,text) to authenticated;

create or replace function public.trigger_competitor_ai_supervisor()
returns void
language plpgsql
security definer
set search_path to 'public','net','pg_temp'
as $$
declare
  v_global boolean := false;
  v_competitor boolean := false;
  v_enabled boolean := true;
  v_secret text;
  v_request_id bigint;
begin
  select coalesce((select value from public.system_intelligence_settings where key='automation_global_enabled'),false) into v_global;
  select coalesce((select value from public.system_intelligence_settings where key='automation_competitor_enabled'),false) into v_competitor;
  select coalesce((select competitor_ai_supervisor_enabled from public.pricing_settings where store_id is null order by updated_at desc nulls last limit 1),true) into v_enabled;
  if not v_global or not v_competitor or not v_enabled then return; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='competitor_scan_cron_secret' order by created_at desc limit 1;
  if nullif(v_secret,'') is null then
    insert into public.competitor_audit_logs(action,details) values ('AI_SUPERVISOR_BLOCKED',jsonb_build_object('reason','missing_cron_secret','timestamp',now()));
    return;
  end if;
  v_request_id := net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-intelligence-agent',
    headers := jsonb_build_object('Content-Type','application/json','x-competitor-scan-secret',v_secret),
    body := jsonb_build_object('action','analyze','requested_by','scheduled-supervisor'),
    timeout_milliseconds := 120000
  );
  insert into public.competitor_audit_logs(action,details) values ('AI_SUPERVISOR_TRIGGERED',jsonb_build_object('net_request_id',v_request_id,'timestamp',now()));
end;
$$;

revoke execute on function public.trigger_competitor_ai_supervisor() from public,anon,authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='shruthi-competitor-ai-supervisor') THEN
    PERFORM cron.schedule('shruthi-competitor-ai-supervisor','10 */6 * * *','select public.trigger_competitor_ai_supervisor();');
  END IF;
END $$;
