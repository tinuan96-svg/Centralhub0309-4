-- Issue #4: bounded staff billing document review. Review is NOT issuance,
-- payment collection, posting, settlement or VAT filing. Those require their
-- own verified approval workflow, not a broad permissioned table UPDATE.
create table if not exists public.ch_staff_billing_reviews(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.finance_documents(id),
 store_id uuid not null references public.stores(id),
 reviewer_id uuid not null references auth.users(id),
 decision text not null check(decision in ('reviewed','needs_correction')),
 note text not null default '' check(char_length(note)<=1000),
 created_at timestamptz not null default now()
);
create index if not exists ch_staff_billing_reviews_doc_created
 on public.ch_staff_billing_reviews(document_id,created_at desc);
alter table public.ch_staff_billing_reviews enable row level security;
revoke all on public.ch_staff_billing_reviews from public,anon,authenticated;

create or replace function public.ch_staff_review_billing_document(
 p_actor uuid,p_document_id uuid,p_store_id uuid,p_decision text,p_note text
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare v_document record;v_id uuid;
begin
 if p_actor is null or p_document_id is null or p_store_id is null or
 p_decision not in ('reviewed','needs_correction') or
 p_note is null or char_length(p_note)>1000 or
 (p_decision='needs_correction' and char_length(btrim(p_note))<5)
 then raise exception 'invalid_billing_review' using errcode='22023'; end if;
 if not exists(
 select 1 from auth.users u join public.user_profiles p on p.id=u.id
 join public.ch_staff_accounts a on a.user_id=u.id
 where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
 and u.raw_app_meta_data->>'must_change_password'='false'
 and p.profile_role='user' and p.is_active and a.status='active'
 and (a.all_stores or exists(select 1 from public.ch_staff_store_access s
   where s.user_id=u.id and s.store_id=p_store_id))
 and not exists(select 1 from unnest(array['billing.view','billing.edit']) as required(permission)
   where not coalesce((select x.allowed from public.ch_staff_permission_overrides x
      where x.user_id=u.id and x.permission_key=required.permission),
    exists(select 1 from public.ch_staff_permissions r
      where r.role_key=a.role_key and r.permission_key=required.permission)))
 ) then raise exception 'staff_billing_permission_denied' using errcode='42501'; end if;
 select id,document_type,posting_status,invoice_number,document_date,amount_gross,currency
 into v_document from public.finance_documents
 where id=p_document_id and store_id=p_store_id for update;
 if not found or v_document.document_type not in ('invoice','bill','credit_note')
  or v_document.posting_status not in ('review','error')
 then raise exception 'billing_document_unavailable' using errcode='P0002'; end if;
 if p_decision='reviewed' and (
   nullif(btrim(v_document.invoice_number),'') is null or
   v_document.document_date is null or
   v_document.amount_gross is null or v_document.amount_gross<0 or
   v_document.currency<>'GBP'
 ) then raise exception 'billing_document_missing_required_fields' using errcode='23514'; end if;
 insert into public.ch_staff_billing_reviews(document_id,store_id,reviewer_id,decision,note)
 values(p_document_id,p_store_id,p_actor,p_decision,btrim(p_note)) returning id into v_id;
 insert into public.ch_staff_activity_audit(actor_id,store_id,resource_type,resource_id,action,previous_value,next_value)
 values(p_actor,p_store_id,'finance_document',p_document_id,'billing_review',
 v_document.posting_status,p_decision);
 return v_id;
end;$$;
revoke all on function public.ch_staff_review_billing_document(uuid,uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.ch_staff_review_billing_document(uuid,uuid,uuid,text,text)
 to service_role;

-- Accountant can classify (NOT reconcile or alter money) an eligible bank row.
create or replace function public.ch_staff_classify_bank_transaction(
 p_actor uuid,p_bank_transaction_id uuid,p_store_id uuid,p_category text
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare v_row record; v_id uuid;
begin
 if p_actor is null or p_bank_transaction_id is null or p_store_id is null
   or p_category not in ('revenue','cogs','variable_cost','operating_expense','finance_cost',
     'tax','asset','liability','equity','transfer','other')
 then raise exception 'invalid_accounting_classification' using errcode='22023'; end if;
 if not exists(
 select 1 from auth.users u join public.user_profiles p on p.id=u.id
 join public.ch_staff_accounts a on a.user_id=u.id
 where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
 and u.raw_app_meta_data->>'must_change_password'='false'
 and p.profile_role='user' and p.is_active and a.status='active'
 and (a.all_stores or exists(select 1 from public.ch_staff_store_access s
  where s.user_id=u.id and s.store_id=p_store_id))
 and not exists(select 1 from unnest(array['finance.view','finance.edit']) as required(permission)
 where not coalesce((select x.allowed from public.ch_staff_permission_overrides x
  where x.user_id=u.id and x.permission_key=required.permission),
  exists(select 1 from public.ch_staff_permissions g
  where g.role_key=a.role_key and g.permission_key=required.permission)))
 ) then raise exception 'staff_accounting_permission_denied' using errcode='42501'; end if;
 select id,accounting_category,is_reconciled,classification_status,
  reconciled_with_order_id,reconciled_with_supplier_invoice_id,amount
 into v_row from public.bank_transactions
 where id=p_bank_transaction_id and store_id=p_store_id for update;
 if not found or v_row.is_reconciled or
  v_row.classification_status in ('reconciled','ignored') or
  v_row.reconciled_with_order_id is not null or
  v_row.reconciled_with_supplier_invoice_id is not null or v_row.amount is null
 then raise exception 'bank_transaction_not_editable' using errcode='P0002'; end if;
 update public.bank_transactions set accounting_category=p_category,
  classification_status='classified',classified_by=p_actor,classified_at=now(),
  updated_at=now()
 where id=v_row.id and store_id=p_store_id
 returning id into v_id;
 insert into public.ch_staff_activity_audit(
 actor_id,store_id,resource_type,resource_id,action,previous_value,next_value)
 values(p_actor,p_store_id,'bank_transaction',v_id,'classify_accounting',
 coalesce(v_row.accounting_category,''),p_category);
 return v_id;
end;$$;
revoke all on function public.ch_staff_classify_bank_transaction(uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.ch_staff_classify_bank_transaction(uuid,uuid,uuid,text)
 to service_role;
