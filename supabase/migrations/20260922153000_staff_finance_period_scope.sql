-- Gate the invoker-mode period summary too. RLS protects its tables, but an
-- explicit entry check gives predictable deny behavior and blocks all-store
-- aggregation for store-scoped staff.
do $body$
declare r record; d text;
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_finance_period_summary'
 loop
   d:=pg_get_functiondef(r.oid);
   if position('public.finance_can_manage(p_store_id)' in d)=0 then
     d:=replace(d,'with ord as (','with access_gate as (select 1 where public.finance_can_manage(p_store_id)), ord as (');
     d:=replace(d,'from public.orders o','from public.orders o cross join access_gate');
     execute d;
   end if;
 end loop;
end $body$;
