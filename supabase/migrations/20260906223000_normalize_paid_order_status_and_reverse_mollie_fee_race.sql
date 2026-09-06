create or replace function public.normalize_paid_order_pending_payment_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.payment_status = 'paid' and new.order_status in ('pending_payment','paid') then
    new.order_status := 'confirmed';
  end if;
  if new.payment_status = 'paid' and new.fulfillment_status = 'pending_payment' then
    new.fulfillment_status := 'pending';
  end if;
  if new.payment_status = 'paid' and new.status in ('pending_payment','paid') then
    new.status := case
      when new.order_status is not null and new.order_status not in ('pending_payment','paid') then new.order_status
      else 'confirmed'
    end;
  end if;
  return new;
end;
$function$;

update public.orders
set status = case
  when order_status is not null and order_status not in ('pending_payment','paid') then order_status
  else 'confirmed'
end,
order_status = case when order_status in ('pending_payment','paid') then 'confirmed' else order_status end,
fulfillment_status = case when fulfillment_status='pending_payment' then 'pending' else fulfillment_status end
where payment_status='paid'
  and (status in ('pending_payment','paid') or order_status in ('pending_payment','paid') or fulfillment_status='pending_payment');

create or replace function public.reconcile_order_from_mollie_balance_transaction()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_order record;
begin
  if new.type <> 'payment' or new.payment_id is null or new.fee_amount is null then
    return new;
  end if;

  for v_order in
    select id
    from public.orders
    where mollie_payment_id = new.payment_id
      and gateway_fee_actual is null
  loop
    update public.orders
    set gateway_fee_actual = new.fee_amount,
        gateway_fee_net = new.fee_amount,
        gateway_fee_gross = new.fee_amount,
        gateway_fee_source = 'mollie_balance_transaction',
        gateway_fee_reconciled_at = now(),
        gateway_fee_meta = coalesce(gateway_fee_meta,'{}'::jsonb) || jsonb_build_object(
          'mollieAccounting', jsonb_build_object(
            'source','mollie_balance_transactions_trigger',
            'balanceTransactionIds',jsonb_build_array(new.id),
            'fee',new.fee_amount,
            'reconciledAt',now()
          )
        )
    where id = v_order.id and gateway_fee_actual is null;
    perform public.recalculate_order_profitability(v_order.id);
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_reconcile_order_from_mollie_balance_transaction on public.mollie_balance_transactions;
create trigger trg_reconcile_order_from_mollie_balance_transaction
after insert or update of payment_id, fee_amount, type on public.mollie_balance_transactions
for each row
when (new.type='payment' and new.payment_id is not null and new.fee_amount is not null)
execute function public.reconcile_order_from_mollie_balance_transaction();
