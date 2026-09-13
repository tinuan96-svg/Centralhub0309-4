-- CentralHub security + performance cleanup.
-- Mirrors the production migration applied on 2026-09-13.

-- Trigger-only helpers should not be callable directly through client API roles.
alter function public.nora_route_external_computer_task() set search_path = pg_catalog;
revoke execute on function public.nora_route_external_computer_task() from public, anon, authenticated;
revoke execute on function public.normalize_customer_care_message_channel() from public, anon, authenticated;
revoke execute on function public.sync_whatsapp_chat_activity() from public, anon, authenticated;
revoke execute on function public.touch_parent_product_on_variant_change() from public, anon, authenticated;

-- Support foreign-key lookups and parent-row delete/update checks.
create index if not exists idx_bank_recon_import_items_canonical_ledger_account_id
  on public.bank_reconciliation_import_items (canonical_ledger_account_id);
create index if not exists idx_nora_action_questions_step_id
  on public.nora_action_questions (step_id);

-- Cache auth.uid() once per statement instead of evaluating it per row.
drop policy if exists voice_assistant_commands_select_own on public.voice_assistant_commands;
create policy voice_assistant_commands_select_own
  on public.voice_assistant_commands
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists voice_assistant_commands_insert_own on public.voice_assistant_commands;
create policy voice_assistant_commands_insert_own
  on public.voice_assistant_commands
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "NORA action sessions admin only" on public.nora_action_sessions;
create policy "NORA action sessions admin only"
  on public.nora_action_sessions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and user_id = (select auth.uid()));

drop policy if exists "NORA action steps admin only" on public.nora_action_steps;
create policy "NORA action steps admin only"
  on public.nora_action_steps
  for all
  to authenticated
  using (
    public.is_admin() and exists (
      select 1
      from public.nora_action_sessions s
      where s.id = nora_action_steps.session_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin() and exists (
      select 1
      from public.nora_action_sessions s
      where s.id = nora_action_steps.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "NORA action questions admin only" on public.nora_action_questions;
create policy "NORA action questions admin only"
  on public.nora_action_questions
  for all
  to authenticated
  using (
    public.is_admin() and exists (
      select 1
      from public.nora_action_sessions s
      where s.id = nora_action_questions.session_id
        and s.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin() and exists (
      select 1
      from public.nora_action_sessions s
      where s.id = nora_action_questions.session_id
        and s.user_id = (select auth.uid())
    )
  );
