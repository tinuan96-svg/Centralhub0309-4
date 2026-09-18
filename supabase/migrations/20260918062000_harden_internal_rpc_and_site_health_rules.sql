-- CentralHub production hardening: protect internal SECURITY DEFINER helpers
-- and seed Site Health rules for current SiteGuru checks.

revoke execute on function public.mark_synced_source_order_inventory_handled() from public, anon, authenticated;
revoke execute on function public.shruthi_complete_source_command_on_session_insert() from public, anon, authenticated;
revoke execute on function public.shruthi_sync_browser_result_to_source_command() from public, anon, authenticated;
revoke execute on function public.sync_shared_publisher_account(uuid) from public, anon, authenticated;
revoke execute on function public.trg_sync_shared_publisher_account() from public, anon, authenticated;
revoke execute on function public.trg_sync_shared_publisher_link() from public, anon, authenticated;

grant execute on function public.mark_synced_source_order_inventory_handled() to service_role;
grant execute on function public.shruthi_complete_source_command_on_session_insert() to service_role;
grant execute on function public.shruthi_sync_browser_result_to_source_command() to service_role;
grant execute on function public.sync_shared_publisher_account(uuid) to service_role;
grant execute on function public.trg_sync_shared_publisher_account() to service_role;
grant execute on function public.trg_sync_shared_publisher_link() to service_role;

insert into public.site_health_rules
  (check_name, category, default_risk_level, auto_fix_allowed, requires_preview, requires_manual_approval, max_files_changed, notes)
values
  ('site_map','technical','high',false,true,true,4,'Sitemap generation and indexing changes require explicit review.'),
  ('error_pages','technical','high',false,true,true,4,'Broken/error pages may require routing or data changes; never auto-fix blindly.'),
  ('similar_content','content','medium',false,true,true,4,'Content deduplication needs editorial review and must preserve product/business meaning.'),
  ('duplicate_meta_descriptions','content','low',false,true,true,4,'Duplicate metadata should be reviewed before bulk rewriting.'),
  ('duplicate_titles','content','low',false,true,true,4,'Duplicate titles should be reviewed before bulk rewriting.')
on conflict (check_name) do nothing;
