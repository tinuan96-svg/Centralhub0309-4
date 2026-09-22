-- Backwards-compatible guard for TWO currently-used Super Admin client RPCs.
-- Blanket authenticated EXECUTE revocation on these breaks the existing
-- main-branch finance screen. Permit them only after a LIVE trusted admin check.
create or replace function public.reconcile_bank_transaction(
 p_transaction_id uuid,p_notes text default null
) returns boolean language plpgsql volatile set search_path='public','pg_temp'
as $$
begin
 if not public.is_admin() then raise exception 'Verified Super Admin required' using errcode='42501';end if;
 update public.bank_transactions set is_reconciled=true,
  reconciliation_status='reconciled',
  reconciliation_notes=coalesce(nullif(btrim(p_notes),''),reconciliation_notes),
  updated_at=now()
 where id=p_transaction_id;
 return found;
end;$$;
grant execute on function public.reconcile_bank_transaction(uuid,text) to authenticated;

create or replace function public.set_bank_transaction_reserve_allocation(
 p_transaction_id uuid,p_enabled boolean,p_reason text default null
) returns void language plpgsql volatile set search_path='public','pg_temp'
as $$
declare v_count integer;
begin
 if not public.is_admin() then raise exception 'Verified Super Admin required' using errcode='42501'; end if;
 if p_transaction_id is null or p_enabled is null then raise exception 'Transaction and option are required' using errcode='22023';end if;
 if not p_enabled then
  select count(*) into v_count from public.finance_reserve_allocations
  where bank_transaction_id=p_transaction_id and status<>'reversed';
  if v_count>0 then raise exception 'This payment already has reserve allocations. Reverse those allocations first.';end if;
 end if;
 update public.bank_transactions set reserve_allocation_enabled=p_enabled,
  reserve_allocation_disabled_reason=case when p_enabled then null else nullif(btrim(p_reason),'') end,
  reserve_allocation_disabled_at=case when p_enabled then null else now() end,
  updated_at=now()
 where id=p_transaction_id;
 if not found then raise exception 'Bank transaction not found';end if;
end;$$;
grant execute on function public.set_bank_transaction_reserve_allocation(uuid,boolean,text) to authenticated;
