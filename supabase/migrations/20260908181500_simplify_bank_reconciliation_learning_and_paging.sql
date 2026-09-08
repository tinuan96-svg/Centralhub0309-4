-- CentralHub Bank Reconciliation simplification + performance hardening.
-- Mirrors the production Supabase changes applied on 2026-09-08.

alter table public.bank_transaction_classification_rules
  add column if not exists ledger_account_id uuid,
  add column if not exists match_source text,
  add column if not exists match_key text,
  add column if not exists auto_reconcile boolean not null default false,
  add column if not exists learned_from_transaction_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='bank_tx_rules_ledger_account_id_fkey') then
    alter table public.bank_transaction_classification_rules
      add constraint bank_tx_rules_ledger_account_id_fkey foreign key (ledger_account_id) references public.finance_ledger_accounts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='bank_tx_rules_learned_from_transaction_id_fkey') then
    alter table public.bank_transaction_classification_rules
      add constraint bank_tx_rules_learned_from_transaction_id_fkey foreign key (learned_from_transaction_id) references public.bank_transactions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='bank_tx_rules_match_source_check') then
    alter table public.bank_transaction_classification_rules
      add constraint bank_tx_rules_match_source_check check (match_source is null or match_source in ('merchant','description','reference'));
  end if;
end $$;

create index if not exists idx_bank_tx_learning_rule_lookup
  on public.bank_transaction_classification_rules(bank_account_id,transaction_type,match_source,match_key,is_active,priority);
create index if not exists idx_bank_transactions_reconciliation_queue
  on public.bank_transactions(transaction_date desc,created_at desc)
  where coalesce(is_reconciled,false)=false and coalesce(reconciliation_status,'')<>'reconciled';

create or replace function public.bank_category_safe_for_auto_reconcile(p_category text,p_type text)
returns boolean language sql immutable as $$
  select coalesce(p_type,'')='debit' and coalesce(p_category,'') in ('operating_expense','other_expense','tax','financing','transfer');
$$;

create or replace function public.apply_bank_transaction_classification_rules(p_transaction_id uuid)
returns uuid
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  t public.bank_transactions%rowtype;
  r public.bank_transaction_classification_rules%rowtype;
  v_reconcile boolean:=false;
  v_category text;
  v_accounting text;
begin
  select * into t from public.bank_transactions where id=p_transaction_id;
  if not found then return null; end if;

  select * into r
  from public.bank_transaction_classification_rules x
  where x.is_active
    and (x.bank_account_id is null or x.bank_account_id=t.bank_account_id)
    and (x.transaction_type is null or x.transaction_type=t.type)
    and (
      (x.match_key is not null and x.match_source='merchant' and public.normalize_bank_ledger_match_text(t.merchant)=x.match_key)
      or (x.match_key is not null and x.match_source='description' and public.normalize_bank_ledger_match_text(t.description)=x.match_key)
      or (x.match_key is not null and x.match_source='reference' and public.normalize_bank_ledger_match_text(t.reference)=x.match_key)
      or (x.match_key is null
          and (x.match_merchant is null or lower(coalesce(t.merchant,'')) like '%'||lower(x.match_merchant)||'%')
          and (x.match_description is null or lower(coalesce(t.description,'')) like '%'||lower(x.match_description)||'%')
          and (x.match_reference is null or lower(coalesce(t.reference,'')) like '%'||lower(x.match_reference)||'%'))
    )
  order by case when x.bank_account_id=t.bank_account_id then 0 else 1 end,x.priority,x.use_count desc,x.updated_at desc
  limit 1;
  if not found then return null; end if;

  v_category:=case when r.transaction_category='savings_allocation' then 'transfer' else r.transaction_category end;
  v_accounting:=case when r.transaction_category='savings_allocation' then 'transfer' else r.accounting_category end;
  v_reconcile:=coalesce(r.auto_reconcile,false) and public.bank_category_safe_for_auto_reconcile(v_category,t.type);

  update public.bank_transactions
  set transaction_category=v_category,
      transaction_type=case v_category when 'sales_income' then 'revenue' when 'supplier_payment' then 'supplier_payment' when 'operating_expense' then 'operating_expense' when 'other_income' then 'other_income' when 'other_expense' then 'other_expense' when 'tax' then 'tax' when 'refund' then 'refund' when 'transfer' then 'transfer' when 'financing' then 'financing' else 'other_expense' end,
      accounting_category=v_accounting,
      ledger_account_id=coalesce(r.ledger_account_id,ledger_account_id),
      ledger_assigned_at=case when r.ledger_account_id is not null then now() else ledger_assigned_at end,
      classification_status=case when v_category='unknown' then 'needs_review' else 'classified' end,
      classified_at=now(),
      is_reconciled=case when v_reconcile then true else is_reconciled end,
      reconciliation_status=case when v_reconcile then 'reconciled' else reconciliation_status end,
      reconciliation_notes=case when v_reconcile then coalesce(reconciliation_notes,'Auto-reconciled from learned bank rule') else reconciliation_notes end,
      reconciliation_source=case when v_reconcile then 'learned_bank_rule' else reconciliation_source end,
      updated_at=now()
  where id=t.id;

  update public.bank_transaction_classification_rules
  set use_count=use_count+1,last_used_at=now(),updated_at=now()
  where id=r.id;
  return r.id;
end $$;

create or replace function public.learn_and_reconcile_bank_transaction(
  p_transaction_id uuid,p_transaction_category text,p_accounting_category text,p_ledger_account_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  bt public.bank_transactions%rowtype;
  v_category text;
  v_accounting text;
  v_source text;
  v_raw text;
  v_key text;
  v_rule_id uuid;
  v_safe boolean:=false;
  v_affected integer:=0;
  v_reconciled integer:=0;
  v_ledger public.finance_ledger_accounts%rowtype;
begin
  if not public.finance_can_manage() then raise exception 'Not authorised'; end if;
  select * into bt from public.bank_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Bank transaction not found'; end if;

  v_category:=case when p_transaction_category='savings_allocation' then 'transfer' else p_transaction_category end;
  v_accounting:=case when p_transaction_category='savings_allocation' then 'transfer' else p_accounting_category end;
  if v_category is null or v_category='unknown' then raise exception 'Choose a real category or ledger head'; end if;

  if p_ledger_account_id is not null then
    select * into v_ledger from public.finance_ledger_accounts where id=p_ledger_account_id and is_active;
    if not found then raise exception 'Ledger account not found or inactive'; end if;
  end if;

  if length(public.normalize_bank_ledger_match_text(bt.merchant))>=4 then v_source:='merchant';v_raw:=bt.merchant;
  elsif length(public.normalize_bank_ledger_match_text(bt.description))>=4 then v_source:='description';v_raw:=bt.description;
  elsif length(public.normalize_bank_ledger_match_text(bt.reference))>=4 then v_source:='reference';v_raw:=bt.reference;
  else v_source:=null;v_raw:=null; end if;
  v_key:=case when v_source is null then null else public.normalize_bank_ledger_match_text(v_raw) end;
  v_safe:=public.bank_category_safe_for_auto_reconcile(v_category,bt.type);

  if v_key is not null then
    select id into v_rule_id from public.bank_transaction_classification_rules r
    where r.is_active and r.bank_account_id is not distinct from bt.bank_account_id
      and r.transaction_type is not distinct from bt.type and r.match_source=v_source and r.match_key=v_key
    order by r.priority,r.updated_at desc limit 1;

    if v_rule_id is null then
      insert into public.bank_transaction_classification_rules(
        bank_account_id,match_merchant,match_description,match_reference,transaction_type,transaction_category,accounting_category,
        ledger_account_id,match_source,match_key,auto_reconcile,learned_from_transaction_id,priority,is_active,use_count,updated_at
      ) values(
        bt.bank_account_id,case when v_source='merchant' then v_key end,case when v_source='description' then v_key end,case when v_source='reference' then v_key end,
        bt.type,v_category,v_accounting,p_ledger_account_id,v_source,v_key,v_safe,p_transaction_id,20,true,0,now()
      ) returning id into v_rule_id;
    else
      update public.bank_transaction_classification_rules
      set transaction_category=v_category,accounting_category=v_accounting,ledger_account_id=p_ledger_account_id,
          auto_reconcile=v_safe,learned_from_transaction_id=p_transaction_id,priority=20,is_active=true,updated_at=now()
      where id=v_rule_id;
    end if;

    with candidates as (
      select t.id from public.bank_transactions t
      where t.bank_account_id is not distinct from bt.bank_account_id and t.type=bt.type
        and ((v_source='merchant' and public.normalize_bank_ledger_match_text(t.merchant)=v_key)
          or (v_source='description' and public.normalize_bank_ledger_match_text(t.description)=v_key)
          or (v_source='reference' and public.normalize_bank_ledger_match_text(t.reference)=v_key))
        and (t.id=p_transaction_id or not (coalesce(t.is_reconciled,false) or coalesce(t.reconciliation_status,'')='reconciled'))
    ), updated as (
      update public.bank_transactions t
      set transaction_category=v_category,
          transaction_type=case v_category when 'sales_income' then 'revenue' when 'supplier_payment' then 'supplier_payment' when 'operating_expense' then 'operating_expense' when 'other_income' then 'other_income' when 'other_expense' then 'other_expense' when 'tax' then 'tax' when 'refund' then 'refund' when 'transfer' then 'transfer' when 'financing' then 'financing' else 'other_expense' end,
          accounting_category=v_accounting,
          ledger_account_id=coalesce(p_ledger_account_id,t.ledger_account_id),
          ledger_assigned_at=case when p_ledger_account_id is not null then now() else t.ledger_assigned_at end,
          ledger_assigned_by=case when p_ledger_account_id is not null then auth.uid() else t.ledger_assigned_by end,
          classification_status='classified',classified_at=now(),classified_by=auth.uid(),
          is_reconciled=case when v_safe then true else t.is_reconciled end,
          reconciliation_status=case when v_safe then 'reconciled' else t.reconciliation_status end,
          reconciliation_notes=case when v_safe then coalesce(t.reconciliation_notes,'Auto-reconciled after learning this merchant/category') else t.reconciliation_notes end,
          reconciliation_source=case when v_safe then 'learned_bank_rule' else t.reconciliation_source end,
          updated_at=now()
      from candidates c where t.id=c.id
      returning t.id,(coalesce(t.is_reconciled,false) or coalesce(t.reconciliation_status,'')='reconciled') done
    ) select count(*)::int,count(*) filter(where done)::int into v_affected,v_reconciled from updated;

    update public.bank_transaction_classification_rules
    set use_count=use_count+greatest(v_affected,1),last_used_at=now(),updated_at=now() where id=v_rule_id;
  else
    update public.bank_transactions
    set transaction_category=v_category,accounting_category=v_accounting,ledger_account_id=coalesce(p_ledger_account_id,ledger_account_id),
        classification_status='classified',classified_at=now(),classified_by=auth.uid(),
        is_reconciled=case when v_safe then true else is_reconciled end,
        reconciliation_status=case when v_safe then 'reconciled' else reconciliation_status end,
        reconciliation_notes=case when v_safe then coalesce(reconciliation_notes,'Reconciled after classification') else reconciliation_notes end,
        reconciliation_source=case when v_safe then 'manual_classification' else reconciliation_source end,
        updated_at=now()
    where id=p_transaction_id;
    v_affected:=1;v_reconciled:=case when v_safe then 1 else 0 end;
  end if;

  return jsonb_build_object('success',true,'rule_id',v_rule_id,'match_source',v_source,'match_label',v_raw,'affected_count',v_affected,'reconciled_count',v_reconciled,'auto_reconcile',v_safe,'category',v_category,'ledger_account_id',p_ledger_account_id);
end $$;

create or replace function public.trg_apply_bank_learning_rule()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin perform public.apply_bank_transaction_classification_rules(new.id);return new;end $$;

drop trigger if exists bank_transactions_learning_classification on public.bank_transactions;
create trigger bank_transactions_learning_classification after insert on public.bank_transactions
for each row execute function public.trg_apply_bank_learning_rule();

create or replace function public.trg_learn_bank_rule_from_classification()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if pg_trigger_depth()>1 then return new; end if;
  if new.transaction_category is null or new.transaction_category='unknown' then return new; end if;
  if not (old.transaction_category is distinct from new.transaction_category or old.accounting_category is distinct from new.accounting_category or old.ledger_account_id is distinct from new.ledger_account_id) then return new; end if;
  if coalesce(new.is_reconciled,false) or coalesce(new.reconciliation_status,'')='reconciled' then return new; end if;
  perform public.learn_and_reconcile_bank_transaction(new.id,new.transaction_category,coalesce(new.accounting_category,'other'),new.ledger_account_id);
  return new;
exception when others then return new;
end $$;

drop trigger if exists bank_transactions_learn_from_classification on public.bank_transactions;
create trigger bank_transactions_learn_from_classification
after update of transaction_category,accounting_category,ledger_account_id on public.bank_transactions
for each row execute function public.trg_learn_bank_rule_from_classification();

create or replace function public.get_bank_reconciliation_page(
  p_reconciliation text default 'unreconciled',p_bank_account_id uuid default null,p_direction text default null,
  p_transaction_category text default null,p_accounting_category text default null,p_from_date date default null,p_to_date date default null,
  p_min_amount numeric default null,p_max_amount numeric default null,p_search text default null,p_limit integer default 100,p_offset integer default 0
)
returns table(
  id uuid,bank_account_id uuid,transaction_date date,transaction_time time without time zone,description text,amount numeric,type text,balance numeric,reference text,merchant text,
  transaction_category text,accounting_category text,classification_status text,reconciliation_status text,is_reconciled boolean,reconciliation_notes text,ledger_account_id uuid,creditor_id uuid,total_matches bigint
)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.finance_can_manage() then raise exception 'Not authorised'; end if;
  return query
  with f as (
    select bt.* from public.bank_transactions bt
    where (p_reconciliation='all'
      or (p_reconciliation='reconciled' and (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled'))
      or (p_reconciliation='unreconciled' and not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled')))
      and (p_bank_account_id is null or bt.bank_account_id=p_bank_account_id)
      and (p_direction is null or bt.type=p_direction)
      and (p_transaction_category is null or coalesce(bt.transaction_category,'unknown')=p_transaction_category)
      and (p_accounting_category is null or coalesce(bt.accounting_category,'unassigned')=p_accounting_category)
      and (p_from_date is null or bt.transaction_date>=p_from_date)
      and (p_to_date is null or bt.transaction_date<=p_to_date)
      and (p_min_amount is null or abs(coalesce(bt.amount,0))>=p_min_amount)
      and (p_max_amount is null or abs(coalesce(bt.amount,0))<=p_max_amount)
      and (nullif(trim(coalesce(p_search,'')),'') is null or coalesce(bt.description,'') ilike '%'||trim(p_search)||'%' or coalesce(bt.merchant,'') ilike '%'||trim(p_search)||'%' or coalesce(bt.reference,'') ilike '%'||trim(p_search)||'%')
  )
  select f.id,f.bank_account_id,f.transaction_date,f.transaction_time,f.description,f.amount,f.type,f.balance,f.reference,f.merchant,
         f.transaction_category,f.accounting_category,f.classification_status,f.reconciliation_status,f.is_reconciled,f.reconciliation_notes,f.ledger_account_id,f.creditor_id,count(*) over()
  from f order by f.transaction_date desc,f.transaction_time desc nulls last,f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),250) offset greatest(coalesce(p_offset,0),0);
end $$;

create or replace function public.get_bank_reconciliation_summary()
returns table(total_transactions bigint,unreconciled_transactions bigint,reconciled_transactions bigint,unreconciled_value numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select count(*)::bigint,
         count(*) filter(where not (coalesce(is_reconciled,false) or coalesce(reconciliation_status,'')='reconciled'))::bigint,
         count(*) filter(where coalesce(is_reconciled,false) or coalesce(reconciliation_status,'')='reconciled')::bigint,
         coalesce(sum(abs(coalesce(amount,0))) filter(where not (coalesce(is_reconciled,false) or coalesce(reconciliation_status,'')='reconciled')),0)::numeric
  from public.bank_transactions where public.finance_can_manage();
$$;

-- Keep the legacy store-scoped overload but remove its DEFAULT argument so no-arg RPC calls are unambiguous.
drop function if exists public.get_bank_reconciliation_summary(uuid);
create function public.get_bank_reconciliation_summary(p_store_id uuid)
returns table(total_transactions integer,unreconciled_transactions integer,reconciled_transactions integer,overdue_reconciliation_transactions integer,unreconciled_value numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
select count(*)::integer,
       count(*) filter(where not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled'))::integer,
       count(*) filter(where coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled')::integer,
       count(*) filter(where not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled') and bt.transaction_date<current_date)::integer,
       coalesce(sum(abs(coalesce(bt.amount,0))) filter(where not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled')),0)::numeric
from public.bank_transactions bt
join public.store_bank_accounts sba on sba.id=bt.bank_account_id
where sba.is_active=true and (p_store_id is null or bt.store_id=p_store_id) and public.finance_can_manage();
$$;

create or replace function public.get_bank_cashflow_summary(p_days integer default 30)
returns table(incoming numeric,outgoing numeric,transaction_count bigint,reconciled_count bigint,unreconciled_count bigint)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(sum(abs(bt.amount)) filter(where bt.type='credit'),0)::numeric,
         coalesce(sum(abs(bt.amount)) filter(where bt.type='debit'),0)::numeric,
         count(*)::bigint,
         count(*) filter(where coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled')::bigint,
         count(*) filter(where not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled'))::bigint
  from public.bank_transactions bt join public.store_bank_accounts a on a.id=bt.bank_account_id and a.is_active
  where bt.transaction_date>=current_date-greatest(coalesce(p_days,30),1)+1 and public.finance_can_manage();
$$;

revoke execute on function public.learn_and_reconcile_bank_transaction(uuid,text,text,uuid) from anon;
revoke execute on function public.get_bank_reconciliation_page(text,uuid,text,text,text,date,date,numeric,numeric,text,integer,integer) from anon;
revoke execute on function public.get_bank_reconciliation_summary() from anon;
revoke execute on function public.get_bank_reconciliation_summary(uuid) from anon;
revoke execute on function public.get_bank_cashflow_summary(integer) from anon;
grant execute on function public.learn_and_reconcile_bank_transaction(uuid,text,text,uuid) to authenticated,service_role;
grant execute on function public.get_bank_reconciliation_page(text,uuid,text,text,text,date,date,numeric,numeric,text,integer,integer) to authenticated,service_role;
grant execute on function public.get_bank_reconciliation_summary() to authenticated,service_role;
grant execute on function public.get_bank_reconciliation_summary(uuid) to authenticated,service_role;
grant execute on function public.get_bank_cashflow_summary(integer) to authenticated,service_role;

-- Bootstrap only exact, historically consistent safe debit expense groups.
with base as (
  select bt.*,case when nullif(trim(bt.merchant),'') is not null then 'merchant' else 'description' end src,
         public.normalize_bank_ledger_match_text(coalesce(nullif(trim(bt.merchant),''),bt.description)) k
  from public.bank_transactions bt
), stable as (
  select b.bank_account_id,b.type,b.src,b.k,count(*) n,
         count(distinct b.transaction_category) filter(where b.transaction_category is not null and b.transaction_category<>'unknown') category_count,
         count(distinct b.ledger_account_id) filter(where b.ledger_account_id is not null) ledger_count,
         (array_agg(b.ledger_account_id) filter(where b.ledger_account_id is not null))[1] ledger_id,
         min(b.transaction_category) filter(where b.transaction_category is not null and b.transaction_category<>'unknown') historical_category,
         min(b.accounting_category) filter(where b.accounting_category is not null) historical_accounting
  from base b where length(b.k)>=4 group by b.bank_account_id,b.type,b.src,b.k
), rules as (
  select s.*,
         case when la.pnl_class='cogs' then 'supplier_payment' when la.pnl_class='finance_cost' then 'financing' when la.pnl_class='tax' then 'tax' when la.pnl_class='other_expense' then 'other_expense' when la.ledger_type='internal' then 'transfer' when la.ledger_type='expense' then 'operating_expense' else s.historical_category end learned_category,
         case when la.pnl_class='cogs' then 'cogs' when la.pnl_class='variable_expense' then 'variable_cost' when la.pnl_class='operating_expense' then 'operating_expense' when la.pnl_class='finance_cost' then 'finance_cost' when la.pnl_class='tax' then 'tax' when la.pnl_class='other_expense' then 'other' when la.ledger_type='internal' then 'transfer' else s.historical_accounting end learned_accounting
  from stable s left join public.finance_ledger_accounts la on la.id=s.ledger_id
  where s.n>=2 and s.category_count=1 and s.type='debit' and s.historical_category in ('operating_expense','other_expense','tax','financing','transfer') and s.ledger_count<=1
)
insert into public.bank_transaction_classification_rules(bank_account_id,match_merchant,match_description,transaction_type,transaction_category,accounting_category,ledger_account_id,match_source,match_key,auto_reconcile,priority,is_active,use_count,updated_at)
select r.bank_account_id,case when r.src='merchant' then r.k end,case when r.src='description' then r.k end,r.type,r.learned_category,r.learned_accounting,r.ledger_id,r.src,r.k,true,30,true,0,now()
from rules r
where public.bank_category_safe_for_auto_reconcile(r.learned_category,r.type)
  and not exists(select 1 from public.bank_transaction_classification_rules x where x.is_active and x.bank_account_id is not distinct from r.bank_account_id and x.transaction_type is not distinct from r.type and x.match_source=r.src and x.match_key=r.k);

with matched as (
  select bt.id,r.transaction_category,r.accounting_category,r.ledger_account_id
  from public.bank_transactions bt join public.bank_transaction_classification_rules r
    on r.is_active and r.auto_reconcile and r.bank_account_id is not distinct from bt.bank_account_id and r.transaction_type is not distinct from bt.type
   and ((r.match_source='merchant' and public.normalize_bank_ledger_match_text(bt.merchant)=r.match_key)
     or (r.match_source='description' and public.normalize_bank_ledger_match_text(bt.description)=r.match_key)
     or (r.match_source='reference' and public.normalize_bank_ledger_match_text(bt.reference)=r.match_key))
  where not (coalesce(bt.is_reconciled,false) or coalesce(bt.reconciliation_status,'')='reconciled')
    and public.bank_category_safe_for_auto_reconcile(r.transaction_category,bt.type)
)
update public.bank_transactions bt
set transaction_category=m.transaction_category,accounting_category=m.accounting_category,ledger_account_id=coalesce(m.ledger_account_id,bt.ledger_account_id),
    classification_status='classified',classified_at=now(),is_reconciled=true,reconciliation_status='reconciled',
    reconciliation_notes=coalesce(bt.reconciliation_notes,'Auto-reconciled from consistent historical classification'),reconciliation_source='learned_bank_rule',updated_at=now()
from matched m where bt.id=m.id;

update public.bank_transactions
set is_reconciled=true,reconciliation_status='reconciled',reconciliation_notes=coalesce(reconciliation_notes,'Auto-reconciled: previously classified safe debit expense'),
    reconciliation_source=coalesce(reconciliation_source,'classified_expense_cleanup'),updated_at=now()
where type='debit' and public.bank_category_safe_for_auto_reconcile(transaction_category,type)
  and coalesce(classification_status,'')='classified'
  and not (coalesce(is_reconciled,false) or coalesce(reconciliation_status,'')='reconciled');
