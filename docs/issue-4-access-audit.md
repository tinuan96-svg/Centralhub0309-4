# Issue #4 — staff access audit / security release gate (22 September 2026)

## New repeatable database release preflight (22 September 2026)
- Added `scripts/issue4-release-database-preflight.sql` to the PR. It is a **read-only assertion script** for authenticated access to RLS-disabled base tables, owner-privileged views, correct outer-row correlation on order items / shipments, absence of direct staff child-table updates and direct EXECUTE grants on selected privileged staff RPCs.
- Executed the full script against the connected CentralHub production Supabase database: **PASS**. All authenticated-accessible public views inspected were `security_invoker=true`; no authenticated-readable public base table lacked RLS. These assertions do **not** prove every custom SQL view and every privileged endpoint is individually store-filtered.
- Separate transaction-scoped negative check under `authenticated` with a synthetic unregistered subject and a spoofed admin JWT claim returned `is_admin()=false`, `is_active_staff()=false`, `staff_has_permission('orders.view')=false`, and zero visible orders, order items, shipments, customers or bank transactions. This is an anonymous/unknown-identity **negative** check, not a positive or negative real staff account E2E test.
- The project lists no separate Supabase development branch. Do not create test staff identities or mutable business fixtures in production to close the E2E gap. Use an already-authorised isolated test project or, if a new Supabase branch is needed, obtain explicit cost confirmation first; test manual account creation, store segregation, individual role grants and denials, password rotation, suspension, privileged API bypasses, background integration continuity and Android login there.
- The staff-rollout feature flags remain OFF and PR #5 remains draft until those checks pass. Do not equate this database preflight or passing CI with permission to activate production users.

## Current verified release status (supersedes initial audit below)
- **NOT READY TO ACTIVATE STAFF OR MERGE PR #5.** The latest development branch includes isolated staff UI, manual Super Admin provisioning/activation, service-role-only bounded departmental actions, and privileged integration hardening. It remains a draft; `main` is still the current production website code.
- Supabase **production database migrations have already been applied** for staff foundation and restrictive RLS. This is not equivalent to deploying or activating the new staff app. A live read confirmed **zero staff accounts and one active verified Super Admin**.
- **Material cross-store disclosure risk corrected in the live RLS:** previous order-item and shipment policies used `o.id=order_id`. Because the inner `orders` table also has `order_id`, PostgreSQL resolved that to `o.id=o.order_id`, losing the outer-row correlation. Migration `20260922223000_staff_correlated_order_scope_fix.sql` now qualifies `order_items.order_id` and `shipments.order_id` in both permissive and restrictive SELECT policies and removes obsolete direct-staff-write grants. Database introspection verified all four policy predicates now bind to the correct outer row.
- **The DHL tracking scheduler is NOT an unknown external job:** read-only production inspection identified an active Supabase pg_cron job `dhl-tracking-poll` (every 10 minutes), running as `postgres`, which invokes `public.trigger_dhl_tracking_poll()` and forwards a configured `app_config.service_role_key` to the Edge function via pg_net. Cron execution successes do **not** prove downstream HTTP success; inspect the actual Edge/pg_net response and compare the configured credential before deploying the hardened Edge handler.
- The trigger was previously directly EXECUTE-able by both `anon` and `authenticated`, potentially letting any caller start a service-role tracking job. Migration `20260922230000_restrict_dhl_tracking_cron_trigger.sql` has been applied: both client roles are denied, while the `postgres` cron owner retains EXECUTE. The cron job remains active.
- The existing Super Admin shipping service directly invokes `shipment-sync-worker` and the DHL poller also invokes that worker; preserve both caller types when deploying the hardened worker. Bank sync has an existing client-side `BankSyncService.syncGoogleSheet` invocation; any other automatic scheduler must be independently identified rather than assumed.
- **Hardened DHL tracking, shipment-sync and bank-sync Edge versions have NOT been deployed.** Verify each actual caller identity, its credential or worker secret, returned HTTP status and existing background-job continuity before switching production Edge handlers. No Netlify production deployment is needed just to apply the RLS/EXECUTE fixes.
- GitHub CI / static tests and SQL policy introspection are **not** positive and negative end-to-end tests using real restricted staff identities. Do not enable `CENTRALHUB_STAFF_ACCESS_VERIFIED` or `CENTRALHUB_STAFF_CREATION_ENABLED` until isolated role/store/bypass/revocation testing, external job compatibility, Android and Super Admin regression checks and one coordinated release have passed.
- No new staff users were created or activated to perform this audit. Existing Super Admin access and customer stores must remain operational throughout release verification.

## Initial historical audit (superseded by current status above)

## Release status at initial audit: DO NOT ACTIVATE STAFF OR DEPLOY PARTIAL RBAC
The repository contains a Supabase Auth login screen and an admin/user selector,
but **does not have an operational permission boundary for staff**. The staff
RBAC foundation in this branch is deny-by-default and has no active assignments.
At the initial audit, no staff migration had yet been applied. See the current status above for production migrations subsequently applied.

### Confirmed in connected production configuration
- The current Netlify production deploy uses `main@ed5aa9b8267a0bad3377b2fb9470f1a43fcdb14b`.
- `user_profiles.profile_role` has an existing `admin|user` check. The
  new staff job title must be stored in the independent `ch_staff_accounts`
  table, never by weakening the legacy profile constraint.
- 248 of 274 public RLS policies mention `is_admin()`; changing the menu
  does not authorise a single staff query.
- At least the following RLS policies allow every authenticated user to
  read/write rows without role and store filters:
  `inventory_audit_label_photos` (select/update/delete),
  `inventory_audit_sessions` and `inventory_audit_session_items` (ALL),
  and `product_barcodes` (select/insert/update). Audit and scope them before
  inviting any staff. Public catalog policies for categories/products might
  be intentional: verify storefront dependencies before changing.
- `app/api/orders/delete/route.ts` previously used cross-store service-role
  credentials without authenticating the incoming caller. This branch adds
  a verified admin check, store ownership check and authenticated browser
  request; test against real sync/order deletion before shipping.
- `public.handle_new_user` previously copied a profile role from
  self-editable `raw_user_meta_data`; the new migration ignores that field.
- `components/AuthProvider.tsx` currently renders authenticated app pages
  without verifying staff role/active status, route permissions or assigned
  store, and `components/ClassifiedSidebar.tsx` is the desktop navigation.

### Supabase Security Advisor findings (read-only review, 22 Sep 2026)
- 9 callable-by-anonymous `SECURITY DEFINER` functions and 24 callable-by-authenticated `SECURITY DEFINER` functions were flagged; some may be intentional, but every privileged RPC needs an explicit permission audit before staff login activation.
- `product_expiry_product_summary` is a security-definer view. Review whether it can bypass product/store policies.
- Some tables have RLS enabled with no policies: this is deny-by-default, but may block a proposed staff workflow.
- Security advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

### User-confirmed account workflow (22 Sep 2026)
- **Manual staff login creation**: the Super Admin enters the staff name, personal work email, role, section/action permissions, and permitted stores. A verified admin-only endpoint uses Supabase Auth Admin `createUser` and a cryptographically random temporary password; no invitation email is sent. The one-time password is returned only to the authenticated Super Admin over a no-store response and displayed until dismissed, not persisted to application storage, audit logs or account tables.
- First login requires the staff member to replace the temporary password through the authenticated `/api/staff/first-login` route. Password rotation does NOT grant permissions or activate the account; the old session is signed out. The changed-password flag is stored in trusted Auth app metadata by the server, not accepted from client input.
- **Manual activation**: the Super Admin must explicitly select `Active` after checking the assigned stores and capabilities. The PATCH endpoint verifies the password-change flag and full security rollout switch, and denies activation if it is not satisfied. Changing permissions and suspending an account are also Super Admin-only.
- At the initial audit, staff saw only password setup / pending access. The current development branch has since added an isolated staff workspace; it remains disabled in production pending full verification.
- Reserved actions `users.view`, `users.manage`, `security.manage`, `settings.manage` are not staff-assignable even by direct POST/PATCH.

## Mandatory release checks
1. Inventory every client-side Supabase table query, RPC, storage path, realtime
   subscription, Next API/Netlify function, Supabase Edge Function and store API.
   Map each to a documented permission and store scope; default deny.
2. Cover all currently broad RLS policies, then replace relevant legacy
   admin-only policies with admin-or-explicit staff-action rules AND row-level
   store restrictions. A filtered frontend query is never a security boundary.
   Related tables without `store_id` must derive it from their parents.
3. Protect all cross-store service-role operations and all financial/refund
   operations on their own servers. Do not trust client role or requested store.
4. Lock app routes and dashboards before rendering data. Require a trusted
   active staff record; staff with unassigned permissions see no business data.
   Audit Android native/voice and OTP paths as well.
5. Add invitation / permission editor using verified Super Admin requests;
   log before/after with actor ID, enforce MFA and protect the last admin.
6. Run positive AND negative end-to-end tests for each role and every allowed
   store, direct REST/RPC/API bypass, changes during an active session,
   account suspension, public endpoints and existing admin flows.
7. Run CI, Netlify deploy-preview smoke, Supabase security advisor and
   rollback test before ONE approved production release. Staff schema
   migrations have since been applied to production; do not enable staff
   creation or activation until the complete release gate passes.

## In-progress change
At the original audit the first migration defined private RLS-protected staff
tables. Subsequent applied migrations introduced role grants and bounded actions.
This historical paragraph alone does NOT establish end-to-end readiness.
