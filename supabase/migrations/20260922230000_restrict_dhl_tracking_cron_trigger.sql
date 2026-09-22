-- Issue #4: DHL tracking scheduler privilege boundary.
--
-- Verified production cron.job 'dhl-tracking-poll' executes as postgres and
-- public.trigger_dhl_tracking_poll() is owned by postgres. The function is
-- SECURITY DEFINER and forwards an app_config service-role secret to pg_net.
-- It must not be callable by anonymous or staff JWTs via PostgREST.
-- Revoking client EXECUTE does not revoke the scheduler owner's privileges.
revoke all on function public.trigger_dhl_tracking_poll() from public,anon,authenticated;
grant execute on function public.trigger_dhl_tracking_poll() to service_role;

do $verify$
begin
 if has_function_privilege('anon',
      'public.trigger_dhl_tracking_poll()','EXECUTE')
    or has_function_privilege('authenticated',
      'public.trigger_dhl_tracking_poll()','EXECUTE')
    or not has_function_privilege('postgres',
      'public.trigger_dhl_tracking_poll()','EXECUTE') then
   raise exception 'dhl_tracking_trigger_execution_boundary_failed';
 end if;
end $verify$;
