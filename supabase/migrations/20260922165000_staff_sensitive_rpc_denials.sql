-- Issue #4: existing SECURITY DEFINER RPCs must not bypass table-level
-- staff RLS. Preserve each function's signature, owner, grants and existing
-- Super Admin behavior; add narrowly targeted staff blocks only.
-- No staff workflow calls these RPCs directly yet. A verified action-specific
-- server endpoint can be introduced after end-to-end security testing.
do $guard$
declare
  f record;
  old_body text;
  new_body text;
  definition text;
  begin_at integer;
  insert_guard text := E'  if public.ch_is_staff_identity() then\n    raise exception ''staff_rpc_access_denied'' using errcode = ''42501'';\n  end if;\n';
begin
  for f in
    select p.oid,p.proname,p.prosrc
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname in (
        'get_finance_customer_profitability',
        'get_finance_product_profitability',
        'assign_product_barcode',
        'finalize_full_inventory_audit',
        'replace_product_expiry_batches_for_audit',
        'replace_product_expiry_boxes_for_audit',
        'resolve_inventory_audit_exception',
        'start_full_inventory_audit',
        'shruthi_resume_browser_question'
      )
  loop
    old_body:=f.prosrc;
    if position('staff_rpc_access_denied' in old_body)>0 then
      continue;
    end if;
    if f.proname='get_finance_customer_profitability' then
      new_body:=replace(old_body,
        E'FROM customer_rollup cr\nORDER BY',
        E'FROM customer_rollup cr\nWHERE public.finance_can_manage()\nORDER BY');
    elsif f.proname='get_finance_product_profitability' then
      new_body:=replace(old_body,
        E'FROM product_rollup pr\nORDER BY',
        E'FROM product_rollup pr\nWHERE public.finance_can_manage()\nORDER BY');
    else
      begin_at:=position(E'\nbegin\n' in lower(old_body));
      if begin_at=0 then
        raise exception 'Cannot identify start of %',f.proname;
      end if;
      new_body:=substr(old_body,1,begin_at-1)
        || substr(old_body,begin_at,7)
        || insert_guard
        || substr(old_body,begin_at+7);
    end if;
    if new_body=old_body then
      raise exception 'Security guard was not inserted into %',f.proname;
    end if;
    definition:=pg_get_functiondef(f.oid);
    if position(old_body in definition)=0 then
      raise exception 'Could not verify original function source for %',f.proname;
    end if;
    execute replace(definition,old_body,new_body);
  end loop;
end;
$guard$;

-- Other SECURITY DEFINER functions must be individually classified. Trigger
-- functions, internal sync workers and public tracking may legitimately use
-- privileged execution; never globally revoke or change them without testing.
