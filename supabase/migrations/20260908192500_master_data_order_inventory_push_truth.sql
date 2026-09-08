-- CentralHub truth/data-wiring hardening: master data columns, paid-only profitability, fulfilment guardrails.

alter table public.stores add column if not exists color text;
alter table public.stores add column if not exists bucket_name text;
alter table public.stores add column if not exists project_ref text;
alter table public.stores add column if not exists api_base_url text;
alter table public.stores add column if not exists domain text;
alter table public.stores add column if not exists visibility boolean not null default true;
alter table public.stores add column if not exists max_display_stock integer default 50;

alter table public.categories add column if not exists description text;
alter table public.categories add column if not exists is_active boolean not null default true;
alter table public.categories add column if not exists updated_at timestamp with time zone not null default now();
alter table public.brands add column if not exists website text;
alter table public.brands add column if not exists is_active boolean not null default true;
alter table public.brands add column if not exists updated_at timestamp with time zone not null default now();

create table if not exists public.supplier_account_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  creditor_id uuid references public.finance_creditors(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  supplier_invoice_id uuid references public.supplier_invoices(id) on delete set null,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  entry_type text not null check (entry_type in ('invoice','payment','credit_note','debit_note','adjustment','opening_balance','refund','writeoff')),
  direction text not null check (direction in ('debit','credit')),
  document_number text,
  entry_date date not null default current_date,
  due_date date,
  amount numeric(12,2) not null default 0,
  currency text not null default 'GBP',
  status text not null default 'posted' check (status in ('draft','posted','void','matched','disputed')),
  description text,
  attachment_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint supplier_account_entries_positive_amount check (amount >= 0),
  constraint supplier_account_entries_party_check check (supplier_id is not null or creditor_id is not null)
);

create index if not exists idx_supplier_account_entries_supplier on public.supplier_account_entries(supplier_id, entry_date desc);
create index if not exists idx_supplier_account_entries_creditor on public.supplier_account_entries(creditor_id, entry_date desc);
create index if not exists idx_supplier_account_entries_invoice on public.supplier_account_entries(supplier_invoice_id);

create or replace view public.v_supplier_account_statement as
select
  e.*,
  coalesce(s.name, c.name) as party_name,
  sum(case when e.direction='debit' then e.amount else -e.amount end)
    over (partition by coalesce(e.supplier_id::text, e.creditor_id::text) order by e.entry_date, e.created_at, e.id) as running_balance
from public.supplier_account_entries e
left join public.suppliers s on s.id=e.supplier_id
left join public.finance_creditors c on c.id=e.creditor_id
where e.status <> 'void';

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

  select count(*), coalesce(sum(coalesce(oi.quantity,0)),0), coalesce(sum(coalesce(oi.quantity,0)*coalesce(oi.cost_price,p.cost_price,0)),0)
  into v_item_rows,v_units,v_cogs
  from public.order_items oi left join public.products p on p.id=oi.product_id
  where oi.order_id=p_order_id;

  if v_item_rows=0 then
    select coalesce(sum(case when (j.item->>'quantity') ~ '^[0-9]+$' then (j.item->>'quantity')::integer else 0 end),0),
           coalesce(sum((case when (j.item->>'quantity') ~ '^[0-9]+$' then (j.item->>'quantity')::numeric else 0 end) * coalesce(p.cost_price,0)),0)
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
  set product_cost_total=v_cogs, product_cost_net=v_cogs, total_cost_net=v_cogs+v_variable,
      gross_profit=v_gross, margin_after_gateway=v_margin, order_cost=v_cogs+v_variable,
      order_profit=v_contribution, order_margin=v_margin, profit_margin=v_margin, updated_at=now()
  where id=p_order_id;

  return jsonb_build_object('order_id',p_order_id,'revenue',v_revenue,'cogs',v_cogs,'gross_profit',v_gross,'variable_costs',v_variable,'contribution_profit',v_contribution,'margin_pct',v_margin,'units',v_units,'item_rows',v_item_rows);
end;
$function$;

create or replace function public.update_order_fulfillment_status(p_order_id uuid, p_status fulfillment_status, p_notes text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_payment_status text;
begin
  select lower(coalesce(payment_status,'')) into v_payment_status from public.orders where id=p_order_id;
  if v_payment_status is distinct from 'paid' and p_status in ('confirmed','picking','picked','packing','packed','ready_to_ship','shipment_booked','collected','shipped','at_local_depot','out_for_delivery','delivered','completed') then
    raise exception 'Payment must be received before fulfilment status can be changed to %', p_status;
  end if;
  update orders set fulfillment_status=p_status, fulfillment_notes=coalesce(p_notes,fulfillment_notes), packed_at=case when p_status='packed' then now() else packed_at end, ready_to_ship_at=case when p_status='ready_to_ship' then now() else ready_to_ship_at end, updated_at=now() where id=p_order_id;
end;
$function$;

create or replace function public.bulk_update_fulfillment_status(p_order_ids uuid[], p_status fulfillment_status, p_notes text default null::text)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_count integer;
begin
  if p_status in ('confirmed','picking','picked','packing','packed','ready_to_ship','shipment_booked','collected','shipped','at_local_depot','out_for_delivery','delivered','completed') and exists (select 1 from public.orders where id=any(p_order_ids) and lower(coalesce(payment_status,'')) <> 'paid') then
    raise exception 'Bulk fulfilment update blocked because one or more selected orders are not payment-received.';
  end if;
  update orders set fulfillment_status=p_status, fulfillment_notes=coalesce(p_notes,fulfillment_notes), packed_at=case when p_status='packed' then now() else packed_at end, ready_to_ship_at=case when p_status='ready_to_ship' then now() else ready_to_ship_at end, updated_at=now() where id=any(p_order_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

update public.orders
set total_revenue=0, product_cost_total=0, product_cost_net=0, total_cost_net=0,
    gross_profit=0, margin_after_gateway=0, order_cost=0, order_profit=0,
    order_margin=0, profit_margin=0, updated_at=now()
where coalesce(is_deleted,false)=false
  and (lower(coalesce(payment_status,'')) <> 'paid' or lower(coalesce(order_status,status::text,'')) in ('cancelled','refunded','failed','payment_failed'));
