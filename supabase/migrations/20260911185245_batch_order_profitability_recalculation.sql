create or replace function public.recalculate_order_profitability_batch(p_order_ids uuid[])
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order_id uuid;
  v_processed integer := 0;
begin
  if p_order_ids is null or coalesce(array_length(p_order_ids, 1), 0) = 0 then
    return jsonb_build_object('processed', 0);
  end if;

  foreach v_order_id in array p_order_ids loop
    perform public.recalculate_order_profitability(v_order_id);
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('processed', v_processed);
end;
$function$;

revoke all on function public.recalculate_order_profitability_batch(uuid[]) from public;
revoke all on function public.recalculate_order_profitability_batch(uuid[]) from anon;
revoke all on function public.recalculate_order_profitability_batch(uuid[]) from authenticated;
grant execute on function public.recalculate_order_profitability_batch(uuid[]) to service_role;
