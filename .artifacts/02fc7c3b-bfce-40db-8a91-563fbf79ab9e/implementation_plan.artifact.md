# CentralHub CB — Audit and Repair Plan

This plan outlines the steps to audit and repair the CentralHub production application, ensuring a stable build, accurate types, and a secure database.

## User Review Required

> [!IMPORTANT]
> The project currently uses **Next.js 16.3.3**, which is a very recent or experimental version. I will proceed with this version unless build errors necessitate a transition to a stable version (e.g., 15.x).

> [!WARNING]
> I will be making significant changes to database triggers and RLS policies. While I will strive to be non-destructive, these changes are critical for security and stability.

## Proposed Changes

### Phase 1: Build & Dependencies
- Align `package.json` and `package-lock.json`.
- Fix linting and TypeScript errors.
- Ensure `npm run build` succeeds.

### Phase 2: Database Type System
- Reconstruct `lib/supabase.ts` from the live database schema.
- Update all application code to use the new types, removing `as any` casts.

### Phase 3: Functional Repairs (Sync & Webhooks)
- Disable/remove legacy `centralhub_products_raw` sync triggers.
- Fix `ordering_key` NULL violations.
- Validate UUIDs for product IDs.
- Fix slug generation and MalluSpices type mismatches.
- Unify queue architecture.

### Phase 4: Security Hardening
- Audit and tighten RLS policies on all public tables.
- Remove anonymous write access.
- Restrict `EXECUTE` on `SECURITY DEFINER` functions.
- Enforce store isolation.

### Phase 5: Data Integrity & Performance
- Fix duplicate SKUs, slugs, and orphan records.
- Validate `NOT VALID` constraints.
- Optimize indexes and query performance.
- Audit Realtime subscriptions.

## Verification Plan

### Automated Tests
- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build`.
- Execute database verification scripts (RLS, triggers, health).

### Manual Verification
- Verify product sync flow via logs.
- Verify order status updates.
- Check WhatsApp notification logs.
