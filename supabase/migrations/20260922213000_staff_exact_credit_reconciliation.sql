-- Only one-to-one exact bank credits can be reconciled by staff. Pooled
-- gateway settlements, fees, reversals, supplier payments, VAT, transfers and
-- ambiguous references remain Super Admin/accountant-review operations.
create or replace function public.ch_staff_reconcile_exact_order_credit(
 p_actor uuid,p_transaction_id uuid,p_store_id uuid,p_order_number text
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare b record;o record;v_result uuid;
begin
 if p_actor is null or p_transaction_id is null or p_store_id is null
   or p_order_number is null or length(btrim(p_order_number))<3
   or length(p_order_number)>80
 then raise exception 'invalid_reconciliation_request' using errcode='22023';end if;
 if not exists(
  select 1 from auth.users u join public.user_profiles p on p.id=u.id
   join public.ch_staff_accounts a on a.user_id=u.id
  where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
   and u.raw_app_meta_data->>'must_change_password'='false'
   and p.profile_role='user' and p.is_active and a.status='active'
   and (a.all_stores or exists(select 1 from public.ch_staff_store_access s
     where s.user_id=u.id and s.store_id=p_store_id))
   and not exists(select 1 from unnest(array['finance.view','finance.reconcile']) as required(permission)
    where not coalesce((select x.allowed from public.ch_staff_permission_overrides x
     where x.user_id=u.id and x.permission_key=required.permission),
     exists(select 1 from public.ch_staff_permissions g
     where g.role_key=a.role_key and g.permission_key=required.permission)))
 ) then raise exception 'staff_reconciliation_permission_denied' using errcode='42501'; end if;
 select id,amount,type,reference,is_reconciled,reconciliation_status,
  reconciled_with_order_id,reconciled_with_supplier_invoice_id,
  transaction_category,accounting_category
 into b from public.bank_transactions where id=p_transaction_id and store_id=p_store_id for update;
 if not found or b.amount is null or b.amount<=0 or b.type<>'credit'
   or b.is_reconciled is true or b.reconciliation_status='reconciled'
   or b.reconciled_with_order_id is not null or b.reconciled_with_supplier_invoice_id is not null
   or b.transaction_category not in ('sales_income','unknown')
   or b.accounting_category is distinct from null and b.accounting_category<>'revenue'
 then raise exception 'bank_credit_unavailable_for_exact_match' using errcode='P0002'; end if;
 select id,total,payment_status,order_number,payment_reference,is_deleted
 into o from public.orders where store_id=p_store_id and order_number=btrim(p_order_number)
 for update;
 if not found or o.payment_status<>'paid' or o.is_deleted is true
   or o.total is null or o.total<=0
   or round(o.total,2)<>round(b.amount,2)
   or nullif(btrim(b.reference),'') is null
   or (btrim(b.reference)<>o.order_number and btrim(b.reference) is distinct from o.payment_reference)
 then raise exception 'exact_order_reference_or_amount_mismatch' using errcode='23514'; end if;
 if exists(select 1 from public.bank_transactions x where x.reconciled_with_order_id=o.id
   and x.id<>b.id and x.is_reconciled is true)
 then raise exception 'order_already_reconciled' using errcode='23514';end if;
 update public.bank_transactions set is_reconciled=true,reconciliation_status='reconciled',
  reconciled_with_order_id=o.id,
  classification_status='reconciled',transaction_category='sales_income',
  accounting_category='revenue',reconciliation_source='staff_exact_order_match',
  reconciliation_confidence=1,classified_by=p_actor,classified_at=now(),
  updated_at=now()
 where id=b.id and store_id=p_store_id and is_reconciled is distinct from true
 returning id into v_result;
 if v_result is null then raise exception 'transaction_changed' using errcode='P0002';end if;
 insert into public.ch_staff_activity_audit(
  actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
 ) values(p_actor,p_store_id,'bank_transaction',v_result,'reconcile_exact_order_credit',
  coalesce(b.reconciliation_status,''),o.id::text);
 return v_result;
end;$$;
revoke all on function public.ch_staff_reconcile_exact_order_credit(uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.ch_staff_reconcile_exact_order_credit(uuid,uuid,uuid,text)
 to service_role;
