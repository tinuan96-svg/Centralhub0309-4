-- Keep paid-order profitability rows aligned with customer-paid totals.
-- Dashboard revenue must match the order total the customer paid, not only item subtotal.

create or replace function public.recalculate_order_profitability(p_order_id uuid)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_order record;
  v_revenue numeric := 0;
  v_cogs numeric := 0;
  v_variable numeric := 0;
  v_gross numeric := 0;
  v_contribution numeric := 0;
  v_units integer := 0;
  v_packing numeric := 0;
  v_shipping numeric := 0;
  v_gateway numeric := 0;
  v_item_rows integer := 0;
  v_margin numeric := 0;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('order_id',p_order_id,'error','order_not_found');
  end if;

  if lower(coalesce(v_order.payment_status,'')) <> 'paid'
     or lower(coalesce(v_order.order_status, v_order.status::text, '')) in ('cancelled','refunded','failed','payment_failed') then
    update public.orders
    set total_revenue=0, product_cost_total=0, product_cost_net=0, total_cost_net=0,
        gross_profit=0, margin_after_gateway=0, order_cost=0, order_profit=0,
        order_margin=0, profit_margin=0, updated_at=now()
    where id=p_order_id;
    return jsonb_build_object('order_id',p_order_id,'skipped',true,'reason','payment_not_received');
  end if;

  v_revenue := coalesce(nullif(v_order.total_net,0), nullif(v_order.total_amount,0), nullif(v_order.total_revenue,0), nullif(v_order.total,0), coalesce(v_order.subtotal,0)+coalesce(v_order.delivery_fee,0), 0);
  v_packing := coalesce(v_order.packing_cost_net,v_order.packing_cost,0);
  v_shipping := coalesce(v_order.shipping_cost_net,v_order.shipping_cost,0);
  v_gateway := coalesce(v_order.gateway_fee_actual,v_order.gateway_fee_estimated,v_order.payment_fee,0);

  select count(*), coalesce(sum(coalesce(oi.quantity,0)),0), coalesce(sum(coalesce(oi.quantity,0)*coalesce(nullif(oi.cost_price,0),nullif(p.cost_price,0),0)),0)
  into v_item_rows,v_units,v_cogs
  from public.order_items oi left join public.products p on p.id=oi.product_id
  where oi.order_id=p_order_id;

  if v_item_rows=0 then
    select coalesce(sum(case when (j.item->>'quantity') ~ '^[0-9]+$' then (j.item->>'quantity')::integer else 0 end),0),
           coalesce(sum((case when (j.item->>'quantity') ~ '^[0-9]+$' then (j.item->>'quantity')::numeric else 0 end) * coalesce(nullif(p.cost_price,0),0)),0)
    into v_units,v_cogs
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) j(item)
    left join public.products p on p.id = case when coalesce(j.item->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (j.item->>'product_id')::uuid else null end
    where o.id=p_order_id;
  end if;

  v_gross := v_revenue-v_cogs;
  v_variable := v_packing+v_shipping+v_gateway;
  v_contribution := v_gross-v_variable;
  v_margin := case when v_revenue=0 then 0 else v_contribution/v_revenue*100 end;

  update public.orders
  set total_revenue=v_revenue,
      product_cost_total=v_cogs,
      product_cost_net=v_cogs,
      total_cost_net=v_cogs+v_variable,
      gross_profit=v_gross,
      margin_after_gateway=v_margin,
      order_cost=v_cogs+v_variable,
      order_profit=v_contribution,
      order_margin=v_margin,
      profit_margin=v_margin,
      updated_at=now()
  where id=p_order_id;

  return jsonb_build_object('order_id',p_order_id,'revenue',v_revenue,'cogs',v_cogs,'gross_profit',v_gross,'variable_costs',v_variable,'contribution_profit',v_contribution,'margin_pct',v_margin,'units',v_units,'item_rows',v_item_rows);
end;
$function$;

select public.recalculate_order_profitability(id)
from public.orders
where payment_status='paid'
  and coalesce(is_deleted,false)=false;
