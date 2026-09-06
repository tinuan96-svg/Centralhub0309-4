-- CentralHub analytics attribution resolution v2
-- Read/reporting layer only. Does not modify operational orders or finance tables.
create table if not exists public.analytics_attribution_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  attribution_model text not null check (attribution_model in ('first_touch','last_non_direct','last_touch','linear')),
  lookback_days integer not null default 30 check (lookback_days between 1 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_analytics_attribution_default_store on public.analytics_attribution_rules(store_id) where is_default=true;
create index if not exists idx_analytics_attribution_rules_store on public.analytics_attribution_rules(store_id);
alter table public.analytics_attribution_rules enable row level security;
revoke all on public.analytics_attribution_rules from anon, authenticated;
drop policy if exists analytics_attribution_rules_admin_select on public.analytics_attribution_rules;
create policy analytics_attribution_rules_admin_select on public.analytics_attribution_rules for select to authenticated using (public.is_admin());
create or replace view public.v_analytics_attribution_touches as
select e.id event_id,e.store_id,e.session_id,e.customer_id,e.order_id,e.event_type,e.timestamp,nullif(lower(trim(e.utm_source)),'') source,nullif(lower(trim(e.utm_medium)),'') medium,nullif(lower(trim(e.utm_campaign)),'') campaign,nullif(trim(e.utm_content),'') content,nullif(trim(e.utm_term),'') term,nullif(trim(e.click_id),'') click_id,e.referrer,case when e.utm_source is not null or e.utm_medium is not null or e.utm_campaign is not null or e.click_id is not null then false when e.referrer is null or trim(e.referrer)='' then true else false end is_direct from public.marketing_events e where e.event_type in ('page_view','session_start','view_item','search','add_to_cart','begin_checkout','purchase');
create or replace function public.analytics_get_attribution(p_store_id uuid,p_start timestamptz,p_end timestamptz,p_model text default 'last_non_direct') returns table(source text,medium text,campaign text,sessions bigint,conversions bigint,revenue numeric,orders bigint) language sql security definer set search_path=public as $$ with touches as (select * from public.v_analytics_attribution_touches where store_id=p_store_id and timestamp>=p_start and timestamp<=p_end), purchases as (select t.order_id,t.session_id,t.customer_id,t.timestamp purchase_time from touches t where t.event_type='purchase' and t.order_id is not null), attributed as (select distinct on (p.order_id) p.order_id,p.session_id,p.customer_id,coalesce(nullif(t.source,''),'direct') source,coalesce(nullif(t.medium,''),'(none)') medium,coalesce(nullif(t.campaign,''),'(not set)') campaign from purchases p join touches t on t.store_id=p_store_id and t.timestamp<=p.purchase_time and t.timestamp>=p.purchase_time-interval '30 days' and (t.source is not null or t.medium is not null or t.campaign is not null or t.click_id is not null or not t.is_direct) order by p.order_id,case when p_model='first_touch' then t.timestamp end asc nulls last,case when p_model='last_touch' then t.timestamp end desc nulls last,case when p_model='last_non_direct' then case when t.is_direct then 1 else 0 end end asc nulls last,case when p_model='last_non_direct' then t.timestamp end desc nulls last) select a.source,a.medium,a.campaign,count(distinct a.session_id) sessions,count(distinct a.order_id) conversions,coalesce(sum(o.total),0) revenue,count(distinct a.order_id) orders from attributed a left join public.orders o on o.id=a.order_id and o.store_id=p_store_id group by a.source,a.medium,a.campaign order by coalesce(sum(o.total),0) desc; $$;
revoke all on function public.analytics_get_attribution(uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.analytics_get_attribution(uuid,timestamptz,timestamptz,text) to authenticated;
