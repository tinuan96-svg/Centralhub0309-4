-- Block direct staff execution of additional privileged stock/expiry RPCs.
-- These are not staff-exposed actions in Issue #4. Existing administrator and
-- service-role stock automation behavior remains untouched.
do $guard$
declare f record; old_body text; new_body text; def text; pos integer;
begin
 for f in
   select p.oid,p.proname,p.prosrc
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and p.proname in (
     'block_products_inside_expiry_20d','refresh_all_product_expiry_states',
     'refresh_product_expiry_state'
   )
 loop
   old_body:=f.prosrc;
   if position('staff_rpc_access_denied' in old_body)>0 then continue; end if;
   pos:=position(E'\nbegin\n' in lower(old_body));
   if pos=0 then raise exception 'Cannot identify PL/pgSQL start of %',f.proname; end if;
   new_body:=substr(old_body,1,pos-1)||substr(old_body,pos,7)
     || E'  if public.ch_is_staff_identity() then\n'
     || E'    raise exception ''staff_rpc_access_denied'' using errcode = ''42501'';\n'
     || E'  end if;\n'
     || substr(old_body,pos+7);
   def:=pg_get_functiondef(f.oid);
   if position(old_body in def)=0 then raise exception 'Cannot verify function body: %',f.proname; end if;
   execute replace(def,old_body,new_body);
 end loop;
end;
$guard$;
