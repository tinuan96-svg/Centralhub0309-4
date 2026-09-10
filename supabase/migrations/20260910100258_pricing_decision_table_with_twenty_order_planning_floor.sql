alter table public.pricing_settings
  add column if not exists planning_min_orders_per_day numeric not null default 20,
  add column if not exists planning_min_order_value numeric not null default 20;

alter table public.pricing_settings
  drop constraint if exists pricing_settings_planning_min_orders_per_day_check,
  add constraint pricing_settings_planning_min_orders_per_day_check check (planning_min_orders_per_day > 0),
  drop constraint if exists pricing_settings_planning_min_order_value_check,
  add constraint pricing_settings_planning_min_order_value_check check (planning_min_order_value >= 0);

create or replace function public.get_pricing_planning_summary(
  p_store_id uuid default null,
  p_days integer default null
)
returns json
language sql
stable
set search_path to 'public','pg_temp'
as $function$
with cfg as (
  select
    greatest(coalesce(p_days, ps.financial_lookback_days, ps.expected_sales_window_days, 30), 7)::int as lookback_days,
    coalesce(ps.planning_min_orders_per_day, 20)::numeric as minimum_orders_per_day,
    coalesce(ps.planning_min_order_value, 20)::numeric as minimum_order_value,
    coalesce(ps.daily_target_net_profit, 100)::numeric as daily_profit_target
  from public.pricing_settings ps
  where ps.store_id is null
  order by ps.updated_at desc nulls last
  limit 1
), paid as (
  select
    o.id,
    coalesce(nullif(o.total,0), nullif(o.total_amount,0), nullif(o.total_revenue,0), o.subtotal, 0)::numeric as order_value,
    (
      coalesce(o.packing_cost_net,o.packing_cost,0)
      + coalesce(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)
      + greatest(coalesce(o.shipping_cost_net,o.shipping_cost,0)-coalesce(o.delivery_fee,0),0)
    )::numeric as variable_cost
  from public.orders o
  cross join cfg
  where lower(coalesce(o.payment_status,''))='paid'
    and coalesce(o.is_deleted,false)=false
    and lower(coalesce(o.order_status,o.status,'')) not in ('cancelled','refunded','failed')
    and o.created_at >= current_date-cfg.lookback_days+1
    and (p_store_id is null or o.store_id=p_store_id)
), qualifying as (
  select paid.*
  from paid cross join cfg
  where paid.order_value > cfg.minimum_order_value
), order_units as (
  select q.id as order_id, coalesce(sum(oi.quantity),0)::numeric as units
  from qualifying q
  left join public.order_items oi on oi.order_id=q.id
  group by q.id
), stats as (
  select
    count(*)::numeric as qualifying_orders,
    avg(q.order_value)::numeric as average_order_value,
    avg(coalesce(u.units,0))::numeric as average_units_per_order,
    sum(q.variable_cost)::numeric as qualifying_variable_costs,
    sum(coalesce(u.units,0))::numeric as qualifying_units
  from qualifying q
  left join order_units u on u.order_id=q.id
), fin as (
  select * from public.get_pricing_financial_context(p_store_id,(select lookback_days from cfg))
), calc as (
  select
    cfg.*,
    stats.qualifying_orders,
    stats.average_order_value,
    stats.average_units_per_order,
    coalesce(stats.qualifying_variable_costs,0) as qualifying_variable_costs,
    coalesce(stats.qualifying_units,0) as qualifying_units,
    case when cfg.lookback_days>0 then stats.qualifying_orders/cfg.lookback_days else 0 end as actual_orders_per_day,
    greatest(cfg.minimum_orders_per_day, case when cfg.lookback_days>0 then stats.qualifying_orders/cfg.lookback_days else 0 end) as planning_orders_per_day,
    fin.daily_operating_expenses
  from cfg cross join stats cross join fin
), final as (
  select *,
    planning_orders_per_day*coalesce(average_units_per_order,0) as planning_units_per_day,
    case when qualifying_units>0 then qualifying_variable_costs/qualifying_units else null end as average_variable_expense_per_unit,
    case when planning_orders_per_day*coalesce(average_units_per_order,0)>0
      then daily_operating_expenses/(planning_orders_per_day*average_units_per_order)
      else null end as allocated_operating_expense_per_unit,
    case when planning_orders_per_day*coalesce(average_units_per_order,0)>0
      then daily_profit_target/(planning_orders_per_day*average_units_per_order)
      else null end as target_profit_per_planning_unit
  from calc
)
select json_build_object(
  'lookback_days',lookback_days,
  'minimum_order_value',round(minimum_order_value,2),
  'qualifying_orders',qualifying_orders,
  'average_order_value',round(average_order_value,2),
  'actual_orders_per_day',round(actual_orders_per_day,2),
  'minimum_orders_per_day',round(minimum_orders_per_day,2),
  'planning_orders_per_day',round(planning_orders_per_day,2),
  'using_estimated_order_floor',actual_orders_per_day < minimum_orders_per_day,
  'average_units_per_order',round(average_units_per_order,2),
  'planning_units_per_day',round(planning_units_per_day,2),
  'average_variable_expense_per_unit',round(average_variable_expense_per_unit,4),
  'daily_operating_expenses',round(daily_operating_expenses,2),
  'allocated_operating_expense_per_unit',round(allocated_operating_expense_per_unit,4),
  'total_expense_allocation_per_unit',round(coalesce(average_variable_expense_per_unit,0)+coalesce(allocated_operating_expense_per_unit,0),4),
  'daily_profit_target',round(daily_profit_target,2),
  'target_profit_per_planning_unit',round(target_profit_per_planning_unit,4)
)
from final;
$function$;

create or replace function public.get_pricing_decision_table(
  p_limit integer default 500,
  p_offset integer default 0,
  p_store_id uuid default null,
  p_product_id uuid default null
)
returns setof json
language sql
stable
set search_path to 'public','pg_temp'
as $function$
with summary as (
  select public.get_pricing_planning_summary(p_store_id,null)::jsonb as j
), cfg as (
  select ps.* from public.pricing_settings ps where ps.store_id is null order by ps.updated_at desc nulls last limit 1
), latest_suggestion as (
  select distinct on (s.product_id) s.* from public.pricing_suggestions s order by s.product_id, s.generated_at desc nulls last
), base as (
  select
    p.id as product_id,p.name as product_name,p.sku,coalesce(p.cost_price,0)::numeric as cogs,coalesce(p.price,0)::numeric as current_price,
    coalesce(p.min_margin,5)::numeric as minimum_margin_percent,ls.recommended_price as suggested_price,ls.pricing_status,ls.data_quality_status,
    ls.data_quality_reasons,ls.recommendation_status,ls.execution_blocked,
    coalesce((summary.j->>'average_variable_expense_per_unit')::numeric,0) as average_variable_expense_per_unit,
    coalesce((summary.j->>'allocated_operating_expense_per_unit')::numeric,0) as allocated_operating_expense_per_unit,
    coalesce((summary.j->>'total_expense_allocation_per_unit')::numeric,0) as total_expense_allocation_per_unit,
    coalesce((summary.j->>'target_profit_per_planning_unit')::numeric,0) as target_profit_per_planning_unit,summary.j as planning_summary,
    c.name as cheapest_competitor_name,cp.price as lowest_competitor_price,cp.last_scanned_at as competitor_scanned_at,
    exists(select 1 from public.price_locks l where l.product_id=p.id and l.is_active=true) as price_locked,
    cfg.competitor_undercut_amount,cfg.max_price_increase_percent,cfg.max_price_decrease_percent,cfg.minimum_price_floor
  from public.products p
  cross join summary cross join cfg
  left join latest_suggestion ls on ls.product_id=p.id
  left join lateral (
    select x.competitor_id,x.price,x.last_scanned_at
    from public.competitor_prices x
    where x.product_id=p.id and x.authoritative_eligible=true and x.last_scanned_at is not null
      and x.last_scanned_at >= now()-make_interval(hours=>greatest(coalesce(cfg.competitor_freshness_window_hours,48)::int,1))
    order by x.price asc,x.last_scanned_at desc limit 1
  ) cp on true
  left join public.competitors c on c.id=cp.competitor_id
  where p.is_active=true and coalesce(p.is_deleted,false)=false and (p_product_id is null or p.id=p_product_id)
), calc as (
  select *,
    cogs+total_expense_allocation_per_unit as full_cost_reference_price,
    current_price-(cogs+total_expense_allocation_per_unit) as current_profit_per_unit,
    case when current_price>0 then (current_price-(cogs+total_expense_allocation_per_unit))/current_price*100 else null end as current_profit_percent,
    cogs+total_expense_allocation_per_unit+target_profit_per_planning_unit as daily_target_price,
    case when current_price>coalesce(lowest_competitor_price,current_price)
      then greatest(lowest_competitor_price-coalesce(competitor_undercut_amount,0.10),0.01) else null end as below_market_price,
    greatest(cogs+average_variable_expense_per_unit,
      case when (cogs+average_variable_expense_per_unit)>0 then (cogs+average_variable_expense_per_unit)/(1-least(greatest(minimum_margin_percent,0),99.99)/100) else 0 end,
      coalesce(minimum_price_floor,0)) as direct_economic_floor
  from base
)
select json_build_object(
  'product_id',product_id,'product_name',product_name,'sku',sku,'cogs',round(cogs,2),
  'average_variable_expense_per_unit',round(average_variable_expense_per_unit,2),
  'allocated_operating_expense_per_unit',round(allocated_operating_expense_per_unit,2),
  'expense_allocation_per_unit',round(total_expense_allocation_per_unit,2),
  'full_cost_reference_price',round(full_cost_reference_price,2),'current_price',round(current_price,2),
  'current_profit_per_unit',round(current_profit_per_unit,2),'current_profit_percent',round(current_profit_percent,1),
  'daily_target_price',round(daily_target_price,2),'daily_target_profit_per_unit',round(target_profit_per_planning_unit,2),
  'daily_target_profit_percent',case when daily_target_price>0 then round(target_profit_per_planning_unit/daily_target_price*100,1) else null end,
  'lowest_competitor_price',round(lowest_competitor_price,2),'cheapest_competitor_name',cheapest_competitor_name,'competitor_scanned_at',competitor_scanned_at,
  'below_market_price',round(below_market_price,2),
  'below_market_profit_per_unit',case when below_market_price is null then null else round(below_market_price-full_cost_reference_price,2) end,
  'below_market_profit_percent',case when below_market_price is null or below_market_price<=0 then null else round((below_market_price-full_cost_reference_price)/below_market_price*100,1) end,
  'suggested_price',round(suggested_price,2),
  'suggested_profit_per_unit',case when suggested_price is null then null else round(suggested_price-full_cost_reference_price,2) end,
  'suggested_profit_percent',case when suggested_price is null or suggested_price<=0 then null else round((suggested_price-full_cost_reference_price)/suggested_price*100,1) end,
  'direct_economic_floor',round(direct_economic_floor,2),'pricing_status',pricing_status,'data_quality_status',data_quality_status,
  'data_quality_reasons',coalesce(data_quality_reasons,'[]'::jsonb),'recommendation_status',recommendation_status,
  'execution_blocked',coalesce(execution_blocked,false),'price_locked',price_locked,
  'max_price_increase_percent',max_price_increase_percent,'max_price_decrease_percent',max_price_decrease_percent,'planning_summary',planning_summary
)::json
from calc
order by product_name
limit least(greatest(coalesce(p_limit,500),1),1000)
offset greatest(coalesce(p_offset,0),0);
$function$;

revoke all on function public.get_pricing_planning_summary(uuid,integer) from public,anon;
revoke all on function public.get_pricing_decision_table(integer,integer,uuid,uuid) from public,anon;
grant execute on function public.get_pricing_planning_summary(uuid,integer) to authenticated,service_role;
grant execute on function public.get_pricing_decision_table(integer,integer,uuid,uuid) to authenticated,service_role;
