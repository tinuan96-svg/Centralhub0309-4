# CentralHub Security Hardening — 2026-09-06

Canonical repository: `tinuan96-svg/Centralhub0309-4`
Canonical branch: `main`
Supabase project: `icnvrpnzjjcbvgcqgiua`

## Scope

This pass hardened database access without deleting or rewriting business data and without changing CentralHub's store/order/product/finance semantics.

## What was verified before the change

- Row Level Security was already enabled on the inspected public ordinary and partitioned tables.
- Public SECURITY DEFINER functions inspected for this pass already pin `search_path`; no unpinned public SECURITY DEFINER function was found.
- Sensitive configuration tables were protected by RLS, but PostgreSQL-level grants were broader than necessary.
- `centralhub_feature_health` was an owner-executed view and therefore could bypass base-table RLS semantics. It also retained anonymous table privileges. This was the material exposure fixed by this pass.

## Changes applied

1. Removed all `anon` table privileges from internal configuration/identity tables:
   - `analytics_store_configs`
   - `app_config`
   - `customer_lifecycle_config`
   - `integration_cron_tokens`
   - `marketing_provider_configs`
   - `marketing_providers`
   - `site_health_store_configs`
   - `store_business_identity`
2. Removed `TRUNCATE`, `REFERENCES` and `TRIGGER` table-control privileges from `authenticated` on those internal tables. Ordinary app access remains governed by RLS.
3. Changed `centralhub_feature_health` to `security_invoker=true` so RLS is evaluated as the caller rather than the view owner.
4. Removed anonymous access to `centralhub_feature_health` and limited authenticated access to read-only.
5. Added narrow admin-only SELECT policies to `order_sync_queue`, `push_subscriptions` and `system_notifications` so the admin health diagnostic continues to report complete operational totals after the view became security-invoker.

## Post-change validation

- Anonymous SELECT and INSERT privileges on all hardened internal tables and the feature-health view are absent.
- Authenticated users no longer have TRUNCATE, REFERENCES or TRIGGER privileges on the hardened internal tables.
- The feature-health view reports `security_invoker=true`.
- The three supporting policies are restricted to `authenticated` and require `public.is_admin()`.
- A transaction-scoped authenticated-admin simulation successfully queried all feature-health rows after hardening, confirming the admin diagnostic remains functional under RLS.
- No rows were deleted or rewritten by this migration.

## Source of truth

The live change is mirrored in:

`supabase/migrations/20260906213800_centralhub_security_hardening.sql`

Future CentralHub migrations should preserve these restrictions rather than re-granting anonymous access to internal configuration tables or reverting the feature-health view to owner-executed behavior.
