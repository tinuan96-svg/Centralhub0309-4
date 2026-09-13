-- Repair the MalluSpices paid-order profitability gap without converting current-catalog estimates into historical actuals.
-- The repair is intentionally scoped to paid, non-cancelled MalluSpices orders in the 2026 dashboard period
-- whose authoritative order-level product_cost_net is still missing/zero.

-- 1) Remove only deterministic legacy sync rows that have an exact real-UUID twin in the same order.
with target_orders as (
  select o.id
  from public.orders o
  join public.stores s on s.id=o.store_id
  where s.slug='malluspices'
    and coalesce(o.is_deleted,false)=false
    and lower(coalesce(o.payment_status,''))='paid'
    and lower(coalesce(o.order_status,'')) not in ('cancelled','refunded','failed','payment_failed')
    and o.created_at >= '2026-01-01T00:00:00Z'
    and o.created_at <= '2026-09-13T22:59:59Z'
    and coalesce(o.product_cost_net,0)<=0
), duplicate_rows as (
  select d.id
  from public.order_items d
  join target_orders t on t.id=d.order_id
  where d.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-000000000000$'
    and exists (
      select 1
      from public.order_items r
      where r.order_id=d.order_id
        and r.id<>d.id
        and r.id::text !~ '^[0-9a-f]{8}-0000-4000-8000-000000000000$'
        and lower(regexp_replace(coalesce(r.product_name,''),'[^a-zA-Z0-9]+','','g')) = lower(regexp_replace(coalesce(d.product_name,''),'[^a-zA-Z0-9]+','','g'))
        and coalesce(r.quantity,0)=coalesce(d.quantity,0)
        and coalesce(r.unit_price,0)=coalesce(d.unit_price,0)
        and coalesce(r.total_price,0)=coalesce(d.total_price,0)
    )
)
delete from public.order_items oi
using duplicate_rows d
where oi.id=d.id;

-- 2) Re-link historical order items only when the current active catalog yields one unique best variant.
with target_orders as (
  select o.id
  from public.orders o
  join public.stores s on s.id=o.store_id
  where s.slug='malluspices'
    and coalesce(o.is_deleted,false)=false
    and lower(coalesce(o.payment_status,''))='paid'
    and lower(coalesce(o.order_status,'')) not in ('cancelled','refunded','failed','payment_failed')
    and o.created_at >= '2026-01-01T00:00:00Z'
    and o.created_at <= '2026-09-13T22:59:59Z'
    and coalesce(o.product_cost_net,0)<=0
), target_items as (
  select oi.id,
         lower(regexp_replace(coalesce(oi.product_name,''),'[^a-zA-Z0-9]+','','g')) as item_n
  from public.order_items oi
  join target_orders o on o.id=oi.order_id
  where oi.product_id is null
     or not exists (
       select 1 from public.products p0
       where p0.id=oi.product_id and coalesce(p0.cost_price,0)>0
     )
), catalog as (
  select p.id,
         p.cost_price,
         coalesce(p.weight_grams, case when p.weight_kg is not null then round(p.weight_kg*1000)::int end) as grams,
         lower(regexp_replace(coalesce(p.name,''),'[^a-zA-Z0-9]+','','g')) as name_n,
         lower(regexp_replace(coalesce(p.brand,''),'[^a-zA-Z0-9]+','','g')) as brand_n
  from public.products p
  where coalesce(p.is_deleted,false)=false
    and coalesce(p.is_archived,false)=false
    and coalesce(p.cost_price,0)>0
), candidates as (
  select ti.id as item_id,
         c.id as product_id,
         (
           case when ti.item_n=c.name_n then 200 else 0 end
           + case when length(c.name_n)>=5 and position(c.name_n in ti.item_n)>0 then 40+least(length(c.name_n),40) else 0 end
           + case when c.brand_n<>'' and position(c.brand_n in ti.item_n)>0 then 80 else 0 end
           + case when c.grams is not null and c.grams>0 and (
               position(c.grams::text||'gm' in ti.item_n)>0
               or (c.grams%1000=0 and position((c.grams/1000)::text||'kg' in ti.item_n)>0)
             ) then 50 else 0 end
         ) as score
  from target_items ti
  join catalog c
    on ti.item_n=c.name_n
    or (length(c.name_n)>=5 and position(c.name_n in ti.item_n)>0)
), best_score as (
  select item_id,max(score) as score
  from candidates
  group by item_id
), resolved as (
  select c.item_id,min(c.product_id::text)::uuid as product_id
  from candidates c
  join best_score b on b.item_id=c.item_id and b.score=c.score
  where c.score>=80
  group by c.item_id
  having count(distinct c.product_id)=1
)
update public.order_items oi
set product_id=r.product_id
from resolved r
where oi.id=r.item_id;

-- 3) One legacy household item has no surviving catalog row. Its £0.62 purchase cost is supported by
-- the 2026-01-20 MalluSpices inventory export retained in the Prime Grocers mailbox.
update public.order_items oi
set cost_price=0.62
from public.orders o
join public.stores s on s.id=o.store_id
where oi.order_id=o.id
  and s.slug='malluspices'
  and coalesce(o.is_deleted,false)=false
  and lower(coalesce(o.payment_status,''))='paid'
  and lower(coalesce(o.order_status,'')) not in ('cancelled','refunded','failed','payment_failed')
  and o.created_at >= '2026-01-01T00:00:00Z'
  and o.created_at <= '2026-09-13T22:59:59Z'
  and coalesce(o.product_cost_net,0)<=0
  and lower(regexp_replace(coalesce(oi.product_name,''),'[^a-zA-Z0-9]+','','g')) = lower(regexp_replace('Scouring Pads 4s by Duzzit','[^a-zA-Z0-9]+','','g'))
  and coalesce(oi.cost_price,0)<=0;

-- 4) Snapshot the catalog cost at creation time for newly synced order items.
-- This is INSERT-only so historical product-link repairs do not masquerade current catalog cost as an old snapshot.
create or replace function public.snapshot_order_item_cost_on_insert()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_cost numeric;
begin
  if coalesce(new.cost_price,0)<=0 and new.product_id is not null then
    select nullif(p.cost_price,0)
      into v_cost
    from public.products p
    where p.id=new.product_id;
    if v_cost is not null then
      new.cost_price:=v_cost;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_snapshot_cost_on_insert on public.order_items;
create trigger order_items_snapshot_cost_on_insert
before insert on public.order_items
for each row execute function public.snapshot_order_item_cost_on_insert();

-- 5) Profitability persistence must never treat missing item snapshots/current mappings as £0 COGS.
-- Persist an authoritative order cost when every item has a snapshot, or preserve an already-authoritative order total.
-- Otherwise leave nullable profitability fields NULL; dashboard logic may still display clearly-labelled current-cost estimates.
create or replace function public.recalculate_order_profitability(p_order_id uuid)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
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
  v_missing_snapshot_items integer := 0;
  v_margin numeric := 0;
  v_cost_source text := 'missing';
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

  select count(*),
         coalesce(sum(coalesce(oi.quantity,0)),0),
         count(*) filter (where coalesce(oi.quantity,0)>0 and coalesce(oi.cost_price,0)<=0),
         coalesce(sum(coalesce(oi.quantity,0)*coalesce(oi.cost_price,0)),0)
    into v_item_rows,v_units,v_missing_snapshot_items,v_cogs
  from public.order_items oi
  where oi.order_id=p_order_id;

  if v_item_rows>0 and v_missing_snapshot_items=0 then
    v_cost_source := 'item_snapshot';
  elsif coalesce(v_order.product_cost_net,0)>0 then
    v_cogs := v_order.product_cost_net;
    v_cost_source := 'order_total';
  else
    update public.orders
    set total_revenue=v_revenue,
        product_cost_total=null,
        product_cost_net=null,
        total_cost_net=null,
        gross_profit=null,
        margin_after_gateway=null,
        order_cost=0,
        order_profit=0,
        order_margin=0,
        profit_margin=null,
        updated_at=now()
    where id=p_order_id;

    return jsonb_build_object(
      'order_id',p_order_id,
      'revenue',v_revenue,
      'cost_complete',false,
      'cost_source','missing',
      'missing_snapshot_items',v_missing_snapshot_items,
      'item_rows',v_item_rows
    );
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

  return jsonb_build_object(
    'order_id',p_order_id,
    'revenue',v_revenue,
    'cogs',v_cogs,
    'gross_profit',v_gross,
    'variable_costs',v_variable,
    'contribution_profit',v_contribution,
    'margin_pct',v_margin,
    'units',v_units,
    'item_rows',v_item_rows,
    'cost_complete',true,
    'cost_source',v_cost_source
  );
end;
$$;
