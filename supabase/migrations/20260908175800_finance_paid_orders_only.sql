-- Enforce the CentralHub rule that revenue/profit/customer/product finance views use payment-received orders only.

create or replace function public.get_finance_period_summary(p_start_date date, p_end_date date, p_store_id uuid default null)
returns table(revenue numeric,cogs numeric,variable_costs numeric,operating_expenses numeric,gross_profit numeric,contribution_profit numeric,net_profit numeric,orders bigint,units_sold bigint,average_profit_per_order numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
with ord as (
  select * from public.orders o
  where coalesce(o.is_deleted,false)=false
    and lower(coalesce(o.payment_status,''))='paid'
    and lower(coalesce(o.order_status,o.status,'')) not in ('cancelled','refunded','failed')
    and o.created_at::date between p_start_date and p_end_date
    and (p_store_id is null or o.store_id=p_store_id)
), agg as (
  select coalesce(sum(coalesce(nullif(o.total_amount,0),nullif(o.total_revenue,0),nullif(o.total,0),coalesce(o.subtotal,0)+coalesce(o.delivery_fee,0))),0) revenue,
         coalesce(sum(coalesce(nullif(o.product_cost_net,0),nullif(o.order_cost,0),0)),0) cogs,
         coalesce(sum(coalesce(o.packing_cost_net,o.packing_cost,0)+coalesce(o.shipping_cost_net,o.shipping_cost,0)+coalesce(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)),0) variable_costs,
         count(*) orders,
         coalesce(sum((select coalesce(sum(oi.quantity),0) from public.order_items oi where oi.order_id=o.id)),0) units_sold
  from ord o
), ex as (
  select coalesce(sum(case when not coalesce(e.is_variable_cost,false) and coalesce(e.expense_type,'operating')='operating' then coalesce(e.amount_net,e.amount_gross,0) else 0 end),0) operating_expenses,
         coalesce(sum(case when coalesce(e.is_variable_cost,false) then coalesce(e.amount_net,e.amount_gross,0) else 0 end),0) variable_expenses
  from public.expenses e
  where coalesce(e.pricing_relevant,true)
    and coalesce(e.invoice_date::date,e.created_at::date) between p_start_date and p_end_date
    and (p_store_id is null or e.store_id=p_store_id or e.store_id is null)
), calc as (
  select a.*,e.operating_expenses,e.variable_expenses,a.revenue-a.cogs gross_profit,a.revenue-a.cogs-a.variable_costs-e.variable_expenses contribution_profit from agg a cross join ex e
)
select revenue,cogs,variable_costs+variable_expenses,operating_expenses,gross_profit,contribution_profit,contribution_profit-operating_expenses,orders,units_sold,case when orders>0 then (contribution_profit-operating_expenses)/orders else 0 end from calc;
$$;

create or replace function public.get_pnl_summary(p_start_date date,p_end_date date)
returns table(revenue numeric,cogs numeric,variable_costs numeric,gross_profit numeric,operating_expenses numeric,net_profit numeric,net_margin_pct numeric)
language sql stable set search_path to 'public','extensions','pg_temp' as $$
with x as (
  select coalesce(sum(total_amount),0) revenue,coalesce(sum(product_cost_net),0) cogs,coalesce(sum(coalesce(packing_cost_net,0)+coalesce(shipping_cost_net,0)+coalesce(gateway_fee_net,0)),0) variable_costs,coalesce(sum(gross_profit),0) gross_profit,coalesce(sum(order_profit),0) order_profit
  from public.orders
  where coalesce(is_deleted,false)=false and lower(coalesce(payment_status,''))='paid' and lower(coalesce(order_status,status,'')) not in ('cancelled','refunded','failed') and created_at::date between p_start_date and p_end_date
), e as (select coalesce(sum(amount_net),0) operating_expenses from public.expenses where invoice_date::date between p_start_date and p_end_date)
select x.revenue,x.cogs,x.variable_costs,x.gross_profit,e.operating_expenses,x.order_profit-e.operating_expenses,case when x.revenue=0 then 0 else round(((x.order_profit-e.operating_expenses)/x.revenue)*100,2) end from x cross join e;
$$;

create or replace function public.get_financial_performance_summary(p_days integer default 30)
returns table(period text,orders bigint,revenue numeric,cogs numeric,expenses numeric,net_profit numeric,avg_profit_per_order numeric)
language sql security definer set search_path to 'public','pg_temp' as $$
with bounds as (select generate_series(0,greatest(p_days-1,0))::int d),
order_daily as (
 select o.created_at::date d,count(*)::bigint orders,
 coalesce(sum(nullif(o.total_net,0)),0)+coalesce(sum(case when nullif(o.total_net,0) is null then o.total else 0 end),0)::numeric revenue,
 coalesce(sum(nullif(o.product_cost_net,0)),0)::numeric cogs,
 coalesce(sum(nullif(o.order_profit,0)),0)::numeric stored_profit,
 coalesce(sum(case when nullif(o.order_profit,0) is null then coalesce(nullif(o.total_net,0),o.total)-coalesce(nullif(o.product_cost_net,0),o.product_cost_total,o.order_cost,0)-coalesce(o.packing_cost_net,0)-coalesce(o.shipping_cost_net,0)-coalesce(o.gateway_fee_net,0) else 0 end),0)::numeric derived_profit
 from public.orders o
 where o.created_at::date>=current_date-greatest(p_days-1,0)
   and coalesce(o.is_deleted,false)=false
   and lower(coalesce(o.payment_status,''))='paid'
   and lower(coalesce(o.order_status,o.status,'')) not in ('cancelled','refunded','failed')
 group by 1
), expense_daily as (
 select coalesce(e.invoice_date,e.created_at)::date d,coalesce(sum(coalesce(e.amount_net,e.amount_gross,0)),0)::numeric expenses
 from public.expenses e where coalesce(e.invoice_date,e.created_at)::date>=current_date-greatest(p_days-1,0) group by 1
), days as (
 select b.d,coalesce(o.orders,0) orders,coalesce(o.revenue,0) revenue,coalesce(o.cogs,0) cogs,coalesce(e.expenses,0) expenses,coalesce(o.stored_profit,0)+coalesce(o.derived_profit,0)-coalesce(e.expenses,0) net_profit
 from bounds b left join order_daily o on o.d=current_date-b.d left join expense_daily e on e.d=current_date-b.d
), periods as (
 select 'Today'::text period,0 lo,0 hi union all select 'Last 7 days',0,least(6,greatest(p_days-1,0)) union all select 'Last 30 days',0,least(29,greatest(p_days-1,0))
)
select p.period,coalesce(sum(d.orders),0)::bigint,coalesce(sum(d.revenue),0)::numeric,coalesce(sum(d.cogs),0)::numeric,coalesce(sum(d.expenses),0)::numeric,coalesce(sum(d.net_profit),0)::numeric,case when coalesce(sum(d.orders),0)=0 then 0 else round(sum(d.net_profit)/sum(d.orders),2) end
from periods p join days d on d.d between p.lo and p.hi group by p.period,p.lo,p.hi order by p.lo desc;
$$;

create or replace view public.v_financial_order_profitability as
select id order_id,order_number,created_at,user_id,store_id,coalesce(total_amount,0) revenue,coalesce(product_cost_net,0) cogs,coalesce(total_cost_net,0) total_cost,coalesce(gross_profit,0) gross_profit,coalesce(order_profit,0) net_profit,case when coalesce(total_amount,0)<>0 then round(coalesce(order_profit,0)/total_amount*100,2) else 0 end net_margin_pct
from public.orders o where coalesce(is_deleted,false)=false and lower(coalesce(payment_status,''))='paid' and lower(coalesce(order_status,status,'')) not in ('cancelled','refunded','failed');

create or replace view public.v_profitability_by_customer as
select coalesce(user_id::text,customer_email::text,guest_email) customer_key,max(customer_name::text) customer_name,count(*) order_count,coalesce(sum(total_amount),0) revenue,coalesce(sum(total_cost_net),0) total_cost,coalesce(sum(order_profit),0) profit
from public.orders o where coalesce(is_deleted,false)=false and lower(coalesce(payment_status,''))='paid' and lower(coalesce(order_status,status,'')) not in ('cancelled','refunded','failed') group by coalesce(user_id::text,customer_email::text,guest_email);

create or replace view public.v_profitability_by_product as
select oi.product_id,max(oi.product_name) product_name,count(distinct oi.order_id) order_count,coalesce(sum(oi.quantity),0) units_sold,coalesce(sum(oi.total_price),0) revenue,coalesce(sum(oi.quantity*coalesce(oi.cost_price,0)),0) cogs,coalesce(sum(oi.total_price-oi.quantity*coalesce(oi.cost_price,0)),0) gross_profit
from public.order_items oi join public.orders o on o.id=oi.order_id
where coalesce(o.is_deleted,false)=false and lower(coalesce(o.payment_status,''))='paid' and lower(coalesce(o.order_status,o.status,'')) not in ('cancelled','refunded','failed') group by oi.product_id;
