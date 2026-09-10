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
with summary as materialized (
  select public.get_pricing_planning_summary(p_store_id,null)::jsonb as j
), cfg as materialized (
  select ps.* from public.pricing_settings ps where ps.store_id is null order by ps.updated_at desc nulls last limit 1
), latest_suggestion as materialized (
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

revoke all on function public.get_pricing_decision_table(integer,integer,uuid,uuid) from public,anon;
grant execute on function public.get_pricing_decision_table(integer,integer,uuid,uuid) to authenticated,service_role;
