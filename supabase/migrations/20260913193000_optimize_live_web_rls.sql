drop policy if exists live_web_bookmarks_owner on public.live_web_bookmarks;
create policy live_web_bookmarks_owner on public.live_web_bookmarks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists live_web_history_owner on public.live_web_history;
create policy live_web_history_owner on public.live_web_history for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists live_web_monitors_owner on public.live_web_monitors;
create policy live_web_monitors_owner on public.live_web_monitors for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists live_web_monitor_events_owner on public.live_web_monitor_events;
create policy live_web_monitor_events_owner on public.live_web_monitor_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
