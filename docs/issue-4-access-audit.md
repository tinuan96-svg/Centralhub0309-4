# Issue #4 — staff access audit / security release gate (22 September 2026)

## Release status: DO NOT ACTIVATE STAFF OR DEPLOY PARTIAL RBAC
The repository contains a Supabase Auth login screen and an admin/user selector,
but **does not have an operational permission boundary for staff**. The staff
RBAC foundation in this branch is deny-by-default and has no active assignments.
No production Supabase migration is applied by this branch.

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
   rollback test before ONE approved production release. Do not apply this
   schema to production or enable staff invites until the complete gate passes.

## In-progress change
The new migration defines private RLS-protected staff tables with no browser
grants, predefined role *names*, but zero grants. It only lays the foundation;
it is NOT the requested end-to-end feature.
