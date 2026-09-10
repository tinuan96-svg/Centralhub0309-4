create or replace function public.apply_pricing_table_candidate(
  p_product_id uuid,
  p_price_source text,
  p_confirmed boolean default false,
  p_initiated_by text default 'pricing-decision-table'
)
returns json
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  d jsonb;
  src text:=upper(trim(coalesce(p_price_source,'')));
  candidate numeric;
  old_price numeric;
  cogs numeric;
  direct_floor numeric;
  max_up numeric;
  max_down numeric;
  low_comp numeric;
  comp_name text;
  full_cost numeric;
  target_price numeric;
  suggested numeric;
  new_price numeric;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if not coalesce(p_confirmed,false) then
    return json_build_object('success',false,'error','Explicit manual confirmation is required');
  end if;

  select x::jsonb into d
  from public.get_pricing_decision_table(1,0,null,p_product_id) x
  limit 1;
  if d is null then return json_build_object('success',false,'error','Active product not found'); end if;

  old_price:=(d->>'current_price')::numeric;
  cogs:=coalesce((d->>'cogs')::numeric,0);
  if cogs<=0 then
    return json_build_object('success',false,'error','MISSING_OR_INVALID_COGS');
  end if;

  direct_floor:=(d->>'direct_economic_floor')::numeric;
  max_up:=coalesce((d->>'max_price_increase_percent')::numeric,20);
  max_down:=coalesce((d->>'max_price_decrease_percent')::numeric,20);
  low_comp:=nullif(d->>'lowest_competitor_price','')::numeric;
  comp_name:=d->>'cheapest_competitor_name';
  full_cost:=nullif(d->>'full_cost_reference_price','')::numeric;
  target_price:=nullif(d->>'daily_target_price','')::numeric;
  suggested:=nullif(d->>'suggested_price','')::numeric;

  candidate:=case src
    when 'COGS_PLUS_EXPENSE' then full_cost
    when 'DAILY_TARGET' then target_price
    when 'LOWEST_COMPETITOR' then low_comp
    when 'BELOW_MARKET_10P' then nullif(d->>'below_market_price','')::numeric
    when 'SUGGESTED' then suggested
    else null
  end;

  if candidate is null then
    return json_build_object('success',false,'error','Selected price source is unavailable for this product','price_source',src);
  end if;
  new_price:=round(candidate,2);
  if new_price<=0 then return json_build_object('success',false,'error','Calculated price must be greater than zero'); end if;
  if coalesce((d->>'price_locked')::boolean,false) then return json_build_object('success',false,'error','PRICE_LOCKED'); end if;
  if new_price<direct_floor then
    return json_build_object('success',false,'error','BELOW_DIRECT_ECONOMIC_FLOOR','direct_economic_floor',round(direct_floor,2),'selected_price',new_price);
  end if;
  if old_price>0 and new_price>round(old_price*(1+greatest(max_up,0)/100),2) then
    return json_build_object('success',false,'error','MAX_INCREASE_GUARDRAIL','maximum_allowed_price',round(old_price*(1+greatest(max_up,0)/100),2),'selected_price',new_price);
  end if;
  if old_price>0 and new_price<round(old_price*(1-greatest(max_down,0)/100),2) then
    return json_build_object('success',false,'error','MAX_DECREASE_GUARDRAIL','minimum_allowed_price',round(old_price*(1-greatest(max_down,0)/100),2),'selected_price',new_price);
  end if;
  if new_price=round(old_price,2) then
    return json_build_object('success',false,'error','NO_PRICE_CHANGE','current_price',round(old_price,2));
  end if;

  perform 1 from public.products where id=p_product_id and is_active=true and coalesce(is_deleted,false)=false for update;
  if not found then return json_build_object('success',false,'error','Active product not found'); end if;

  update public.products set price=new_price,updated_at=now() where id=p_product_id;

  insert into public.price_change_audit(
    product_id,old_price,new_price,competitive_target,required_profit_price,final_price,
    lowest_competitor,cheapest_competitor,target_profit,allocated_overhead,product_cost,
    strategy,decision_reason,initiated_by,manually_approved,automatically_applied
  ) values (
    p_product_id,old_price,new_price,low_comp,target_price,new_price,
    low_comp,comp_name,(d->'planning_summary'->>'daily_profit_target')::numeric,
    (d->>'allocated_operating_expense_per_unit')::numeric,cogs,
    'MANUAL_DECISION_TABLE_'||src,
    'Manually selected from Pricing Decision Table: '||src,
    p_initiated_by,true,false
  );

  update public.pricing_suggestions
  set recommendation_status='stale',execution_blocked=true,
      data_quality_status='pending',
      data_quality_reasons=case
        when coalesce(data_quality_reasons,'[]'::jsonb) ? 'PRICE_CHANGED_SINCE_RECOMMENDATION' then coalesce(data_quality_reasons,'[]'::jsonb)
        else coalesce(data_quality_reasons,'[]'::jsonb)||jsonb_build_array('PRICE_CHANGED_SINCE_RECOMMENDATION')
      end
  where product_id=p_product_id
    and id=(select id from public.pricing_suggestions where product_id=p_product_id order by generated_at desc nulls last limit 1);

  return json_build_object(
    'success',true,'product_id',p_product_id,'price_source',src,
    'old_price',round(old_price,2),'new_price',new_price,
    'manual_action',true,'auto_applied',false,'recommendation_marked_stale',true
  );
end;
$function$;

revoke all on function public.apply_pricing_table_candidate(uuid,text,boolean,text) from public,anon;
grant execute on function public.apply_pricing_table_candidate(uuid,text,boolean,text) to authenticated,service_role;
