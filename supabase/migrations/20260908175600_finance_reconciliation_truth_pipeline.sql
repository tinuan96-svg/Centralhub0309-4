-- Canonical CentralHub finance-document posting pipeline.
-- Mirrors the production migration applied on 2026-09-08.

alter table public.finance_documents
  add column if not exists posting_status text not null default 'pending',
  add column if not exists posting_entity_type text,
  add column if not exists posting_entity_id uuid,
  add column if not exists posting_error text,
  add column if not exists posted_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='finance_documents_posting_status_check') then
    alter table public.finance_documents add constraint finance_documents_posting_status_check check (posting_status in ('pending','posted','review','error','ignored'));
  end if;
end $$;

alter table public.expenses add column if not exists finance_document_id uuid, add column if not exists creditor_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='expenses_finance_document_id_fkey') then
    alter table public.expenses add constraint expenses_finance_document_id_fkey foreign key (finance_document_id) references public.finance_documents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='expenses_creditor_id_fkey') then
    alter table public.expenses add constraint expenses_creditor_id_fkey foreign key (creditor_id) references public.finance_creditors(id) on delete set null;
  end if;
end $$;
create unique index if not exists expenses_finance_document_uidx on public.expenses(finance_document_id) where finance_document_id is not null;

alter table public.supplier_invoices add column if not exists finance_document_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='supplier_invoices_finance_document_id_fkey') then
    alter table public.supplier_invoices add constraint supplier_invoices_finance_document_id_fkey foreign key (finance_document_id) references public.finance_documents(id) on delete set null;
  end if;
end $$;
create unique index if not exists supplier_invoices_finance_document_uidx on public.supplier_invoices(finance_document_id) where finance_document_id is not null;
create unique index if not exists supplier_invoice_payments_bank_invoice_uidx on public.supplier_invoice_payments(bank_transaction_id,supplier_invoice_id) where bank_transaction_id is not null;

create or replace function public.finance_sync_posted_input_vat(p_document_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare d public.finance_documents%rowtype; e public.expenses%rowtype; si public.supplier_invoices%rowtype; v_status text; v_exception text;
begin
  select * into d from public.finance_documents where id=p_document_id; if not found then return; end if;
  update public.vat_transactions set is_active=false,exception_code='posted_to_accounting_entity',updated_at=now() where source_type='finance_document' and source_id=p_document_id::text and direction='input' and not is_locked;
  if d.posting_entity_type='expense' and d.posting_entity_id is not null then
    select * into e from public.expenses where id=d.posting_entity_id; if not found then return; end if;
    v_status:=case when e.vat_amount is null or e.amount_net is null or e.amount_gross is null then 'unresolved' else 'review_required' end;
    v_exception:=case when v_status='unresolved' then 'expense_missing_vat_values' else 'input_vat_recoverability_needs_review' end;
    insert into public.vat_transactions(store_id,source_type,source_id,source_line_id,direction,tax_point,description,net_amount,vat_amount,gross_amount,recoverable_vat_amount,recoverable_confirmed,classification_status,exception_code,is_adjustment,is_active,metadata)
    values(e.store_id,'expense',e.id::text,'','input',coalesce(e.invoice_date,e.created_at)::date,coalesce(e.description,'Expense'),e.amount_net,e.vat_amount,e.amount_gross,0,false,v_status,v_exception,false,true,jsonb_build_object('finance_document_id',p_document_id,'category',e.category,'payment_status',e.payment_status))
    on conflict (source_type,source_id,source_line_id,direction) do update set store_id=excluded.store_id,tax_point=excluded.tax_point,description=excluded.description,net_amount=excluded.net_amount,vat_amount=excluded.vat_amount,gross_amount=excluded.gross_amount,classification_status=case when public.vat_transactions.recoverable_confirmed then public.vat_transactions.classification_status else excluded.classification_status end,exception_code=case when public.vat_transactions.recoverable_confirmed then public.vat_transactions.exception_code else excluded.exception_code end,is_active=true,metadata=excluded.metadata,updated_at=now();
  elsif d.posting_entity_type='supplier_invoice' and d.posting_entity_id is not null then
    select * into si from public.supplier_invoices where id=d.posting_entity_id; if not found then return; end if;
    v_status:=case when si.tax_amount is null or si.subtotal is null or si.total_amount is null then 'unresolved' else 'review_required' end;
    v_exception:=case when v_status='unresolved' then 'supplier_invoice_missing_vat_values' else 'input_vat_recoverability_needs_review' end;
    insert into public.vat_transactions(store_id,source_type,source_id,source_line_id,direction,tax_point,description,net_amount,vat_amount,gross_amount,recoverable_vat_amount,recoverable_confirmed,classification_status,exception_code,is_adjustment,is_active,metadata)
    values(si.store_id,'supplier_invoice',si.id::text,'','input',si.invoice_date,coalesce('Supplier invoice '||si.invoice_number,'Supplier invoice'),si.subtotal,si.tax_amount,si.total_amount,0,false,v_status,v_exception,false,true,jsonb_build_object('finance_document_id',p_document_id,'invoice_number',si.invoice_number,'payment_status',si.payment_status))
    on conflict (source_type,source_id,source_line_id,direction) do update set store_id=excluded.store_id,tax_point=excluded.tax_point,description=excluded.description,net_amount=excluded.net_amount,vat_amount=excluded.vat_amount,gross_amount=excluded.gross_amount,classification_status=case when public.vat_transactions.recoverable_confirmed then public.vat_transactions.classification_status else excluded.classification_status end,exception_code=case when public.vat_transactions.recoverable_confirmed then public.vat_transactions.exception_code else excluded.exception_code end,is_active=true,metadata=excluded.metadata,updated_at=now();
  end if;
end $$;

create or replace function public.finance_post_document_accounting(p_document_id uuid,p_mode text default 'auto')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  d public.finance_documents%rowtype; c public.finance_creditors%rowtype; bt public.bank_transactions%rowtype; v_supplier_id uuid; v_supplier_count integer:=0; v_supplier_terms integer:=30; v_ledger record; v_entity_id uuid; v_due_date date; v_paid boolean:=false; v_net numeric; v_vat numeric; v_gross numeric; v_expense_type text; v_category text; v_is_variable boolean:=false; v_pricing_relevant boolean:=true; v_amount_basis text; v_existing_payment numeric;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' and coalesce(public.finance_can_manage(),false)=false then raise exception 'Not authorized'; end if;
  select * into d from public.finance_documents where id=p_document_id for update; if not found then return jsonb_build_object('ok',false,'status','not_found'); end if;
  if lower(coalesce(d.subject,''))~'(payout|gateway statement|settlement statement)' then update public.finance_documents set posting_status='ignored',posting_error='gateway_payout_or_settlement_evidence',posted_at=coalesce(posted_at,now()),updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','ignored'); end if;
  if d.document_type in ('statement','order_confirmation','other') then update public.finance_documents set posting_status='ignored',posting_error='non_posting_document_type',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','ignored'); end if;
  if d.document_type='credit_note' then update public.finance_documents set posting_status='review',posting_error='credit_note_requires_original_document_link',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  if upper(coalesce(d.currency,'GBP'))<>'GBP' then update public.finance_documents set posting_status='review',posting_error='non_gbp_document_requires_review',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  v_gross:=d.amount_gross; v_vat:=d.vat_amount; v_net:=coalesce(d.amount_net,case when d.amount_gross is not null and d.vat_amount is not null then d.amount_gross-d.vat_amount else d.amount_gross end);
  if v_gross is null or v_gross<=0 then update public.finance_documents set posting_status='review',posting_error='missing_or_invalid_total',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  select b.* into bt from public.finance_document_bank_matches m join public.bank_transactions b on b.id=m.bank_transaction_id where m.finance_document_id=p_document_id and m.match_role='allocation' and m.match_status in ('auto_confirmed','confirmed') order by coalesce(m.confidence,0) desc,coalesce(m.confirmed_at,m.matched_at,m.created_at) desc limit 1;
  if found and bt.type='debit' and abs(abs(coalesce(bt.amount,0))-coalesce(d.amount_paid,v_gross))<=0.01 then v_paid:=true; end if;
  v_amount_basis:=coalesce(d.extracted_metadata->>'amount_basis','');
  if d.source_type='gmail' and d.parse_status not in ('reconciled','matched') and v_amount_basis<>'labelled_total' then update public.finance_documents set posting_status='review',posting_error='gmail_amount_not_strongly_identified',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  if d.document_type in ('receipt','payment_receipt') and not v_paid then update public.finance_documents set posting_status='review',posting_error='payment_document_requires_confirmed_bank_match',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  if d.creditor_id is null then update public.finance_documents set posting_status='review',posting_error='creditor_not_identified',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  select * into c from public.finance_creditors where id=d.creditor_id and is_active; if not found then update public.finance_documents set posting_status='review',posting_error='creditor_inactive_or_missing',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
  v_supplier_id:=coalesce(d.supplier_id,c.supplier_id); if c.default_ledger_account_id is not null then select * into v_ledger from public.finance_ledger_accounts where id=c.default_ledger_account_id; end if;
  if c.creditor_type='supplier' then
    if v_supplier_id is null or d.document_type not in ('invoice','bill') then update public.finance_documents set posting_status='review',posting_error='supplier_mapping_or_invoice_required',updated_at=now() where id=p_document_id; return jsonb_build_object('ok',true,'status','review'); end if;
    select coalesce(nullif(s.credit_period_days,0),c.default_payment_terms_days,30) into v_supplier_terms from public.suppliers s where s.id=v_supplier_id; v_due_date:=coalesce(d.due_date,d.document_date+coalesce(v_supplier_terms,30));
    select id into v_entity_id from public.supplier_invoices where finance_document_id=p_document_id limit 1;
    if v_entity_id is null then insert into public.supplier_invoices(finance_document_id,invoice_number,supplier_id,status,invoice_date,due_date,subtotal,tax_amount,shipping_cost,total_amount,amount_paid,currency,notes,payment_status,store_id) values(p_document_id,coalesce(nullif(d.invoice_number,''),nullif(d.document_reference,''),'FD-'||left(p_document_id::text,8)),v_supplier_id,'received',coalesce(d.document_date,current_date),v_due_date,coalesce(v_net,v_gross),coalesce(v_vat,0),0,v_gross,0,'GBP','Auto-created from finance document','unpaid',d.store_id) returning id into v_entity_id; end if;
    if v_paid then
      insert into public.bank_supplier_invoice_matches(bank_transaction_id,supplier_invoice_id,matched_amount,match_status,confidence,matched_by,notes) values(bt.id,v_entity_id,least(abs(bt.amount),v_gross),'confirmed',1,'finance_document_auto','Confirmed from finance document') on conflict (bank_transaction_id,supplier_invoice_id) do update set matched_amount=excluded.matched_amount,match_status='confirmed',confidence=1,matched_by='finance_document_auto',matched_at=now();
      insert into public.supplier_invoice_payments(supplier_invoice_id,bank_transaction_id,payment_date,amount,reference,notes) values(v_entity_id,bt.id,bt.transaction_date,least(abs(bt.amount),v_gross),coalesce(bt.reference,d.payment_reference,d.document_reference),'Auto-posted from finance document') on conflict (bank_transaction_id,supplier_invoice_id) where bank_transaction_id is not null do update set payment_date=excluded.payment_date,amount=excluded.amount,reference=excluded.reference;
      select coalesce(sum(amount),0) into v_existing_payment from public.supplier_invoice_payments where supplier_invoice_id=v_entity_id;
      update public.supplier_invoices set amount_paid=least(v_existing_payment,total_amount),payment_status=case when v_existing_payment>=total_amount-0.01 then 'paid' when v_existing_payment>0 then 'part_paid' else 'unpaid' end,paid_at=case when v_existing_payment>=total_amount-0.01 then coalesce(paid_at,now()) else null end,updated_at=now() where id=v_entity_id;
      update public.bank_transactions set supplier_invoice_id=v_entity_id,reconciled_with_supplier_invoice_id=v_entity_id,creditor_id=c.id,ledger_account_id=coalesce((select id from public.finance_ledger_accounts where code='2000' limit 1),ledger_account_id),transaction_type='supplier_payment',transaction_category='supplier_payment',accounting_category='liability',classification_status='reconciled',reconciliation_status='reconciled',is_reconciled=true,reconciliation_source=coalesce(reconciliation_source,'finance_document'),updated_at=now() where id=bt.id;
    end if;
    update public.finance_documents set supplier_id=v_supplier_id,posting_status='posted',posting_entity_type='supplier_invoice',posting_entity_id=v_entity_id,posting_error=null,posted_at=coalesce(posted_at,now()),updated_at=now() where id=p_document_id;
  else
    v_category:=coalesce(v_ledger.name,case c.creditor_type when 'courier' then 'Shipping / courier costs' when 'packaging' then 'Packaging materials' when 'utility' then 'Utilities' when 'software' then 'Software / online services' when 'rent' then 'Rent' when 'marketing' then 'Marketing' when 'tax_authority' then 'Taxes' else 'Other' end);
    v_is_variable:=coalesce(c.default_accounting_category='variable_cost',false); v_expense_type:=case c.default_accounting_category when 'variable_cost' then 'variable' when 'finance_cost' then 'finance' when 'tax' then 'tax' else 'operating' end; v_pricing_relevant:=coalesce(v_ledger.pricing_relevant,true); if c.creditor_type in ('courier','packaging') or lower(c.name) like '%mollie%' then v_pricing_relevant:=false; end if;
    select id into v_entity_id from public.expenses where finance_document_id=p_document_id limit 1;
    if v_entity_id is null then insert into public.expenses(finance_document_id,creditor_id,amount_gross,amount_net,vat_amount,invoice_date,payment_status,description,store_id,category,expense_type,is_variable_cost,pricing_relevant,due_date,paid_at,bank_transaction_id,notes,file_url) values(p_document_id,c.id,v_gross,v_net,coalesce(v_vat,0),coalesce(d.document_date,current_date)::timestamptz,case when v_paid then 'paid' else 'unpaid' end,coalesce(c.name,d.subject,'Business expense'),d.store_id,v_category,v_expense_type,v_is_variable,v_pricing_relevant,d.due_date,case when v_paid then coalesce(bt.transaction_date,d.paid_date,current_date)::timestamptz else null end,case when v_paid then bt.id else null end,'Auto-posted from finance document',coalesce(d.storage_path,d.source_url)) returning id into v_entity_id;
    else update public.expenses set creditor_id=c.id,amount_gross=v_gross,amount_net=v_net,vat_amount=coalesce(v_vat,0),payment_status=case when v_paid then 'paid' else payment_status end,paid_at=case when v_paid then coalesce(paid_at,bt.transaction_date::timestamptz,now()) else paid_at end,bank_transaction_id=case when v_paid then bt.id else bank_transaction_id end where id=v_entity_id; end if;
    if v_paid then update public.bank_transactions set expense_id=v_entity_id,creditor_id=c.id,ledger_account_id=coalesce(c.default_ledger_account_id,ledger_account_id),transaction_type=coalesce(c.default_transaction_type,transaction_type),transaction_category=coalesce(c.default_transaction_category,transaction_category),accounting_category=coalesce(c.default_accounting_category,accounting_category),classification_status='reconciled',reconciliation_status='reconciled',is_reconciled=true,reconciliation_source=coalesce(reconciliation_source,'finance_document'),updated_at=now() where id=bt.id; end if;
    update public.finance_documents set posting_status='posted',posting_entity_type='expense',posting_entity_id=v_entity_id,posting_error=null,posted_at=coalesce(posted_at,now()),updated_at=now() where id=p_document_id;
  end if;
  perform public.finance_sync_posted_input_vat(p_document_id); return jsonb_build_object('ok',true,'status','posted','entity_id',v_entity_id,'paid',v_paid);
exception when others then update public.finance_documents set posting_status='error',posting_error=left(sqlerrm,1000),updated_at=now() where id=p_document_id; return jsonb_build_object('ok',false,'status','error','error',sqlerrm); end $$;

create or replace function public.trg_finance_post_document_accounting() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$ begin if pg_trigger_depth()>1 then return new; end if; perform public.finance_post_document_accounting(new.id,'document_trigger'); return new; end $$;
create or replace function public.trg_finance_post_document_match() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$ begin if pg_trigger_depth()>1 then return new; end if; perform public.finance_post_document_accounting(new.finance_document_id,'bank_match_trigger'); return new; end $$;
drop trigger if exists finance_documents_auto_post on public.finance_documents;
create trigger finance_documents_auto_post after insert or update of parse_status,creditor_id,supplier_id,amount_gross,amount_net,vat_amount on public.finance_documents for each row execute function public.trg_finance_post_document_accounting();
drop trigger if exists finance_document_match_auto_post on public.finance_document_bank_matches;
create trigger finance_document_match_auto_post after insert or update of match_status on public.finance_document_bank_matches for each row when (new.match_status in ('auto_confirmed','confirmed')) execute function public.trg_finance_post_document_match();

create or replace view public.v_finance_document_exceptions as
select fd.id,fd.store_id,s.name store_name,fd.source_type,fd.document_type,fd.document_date,fd.sender_name,fd.sender_email,fd.subject,fd.invoice_number,fd.amount_net,fd.vat_amount,fd.amount_gross,fd.parse_status,fd.posting_status,fd.posting_error,fd.creditor_id,fc.name creditor_name,fd.created_at,fd.updated_at
from public.finance_documents fd left join public.stores s on s.id=fd.store_id left join public.finance_creditors fc on fc.id=fd.creditor_id
where fd.posting_status in ('review','error') or fd.parse_status in ('needs_review','error');

-- Idempotent historical posting. Ambiguous evidence stays in review.
select public.finance_post_document_accounting(id,'migration_backfill') from public.finance_documents where posting_status='pending';
