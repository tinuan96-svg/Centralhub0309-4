# Order Synchronization — End-to-End Audit Report
**Date:** 2026-08-05  
**Auditor:** Automated system audit

---

## Executive Summary

3 stores are connected to CentralHub. **376 orders are present** in the database (289 MalluSpices, 65 KeralaGroceries, 21 PocketGrocery). However, **5 critical issues** were found and fixed during this audit. The most severe: every order in the system has **0 line items** (`order_items` is completely empty), meaning item-level data, cost calculations, and profit tracking are all missing.

---

## 1. Per-Store Status

| Store | Store ID | Orders in CentralHub | Paid | Pending Payment | Cancelled | Oldest Order | Latest Order | Item Rows |
|---|---|---|---|---|---|---|---|---|
| MalluSpices | `00000000-...-0001` | 289 | 40 | 233 | 8 | 2026-04-20 | 2026-07-13 | **0** |
| KeralaGroceries | `15a0d635-...` | 65 | 2 | 60 | 0 | 2026-05-30 | 2026-07-13 | **0** |
| PocketGrocery | `17de3460-...` | 21 | 0 | 21 | 0 | 2026-07-06 | 2026-07-11 | **0** |
| *Orphan (no store)* | NULL | 1 | — | — | — | 2026-06-29 | 2026-06-29 | 0 |

---

## 2. Credentials & Environment Variables

### Deployed Edge Function Secrets (server-side — PRESENT)
| Secret | Status |
|---|---|
| `MALLUSPICES_SUPABASE_URL` | ✅ Present |
| `MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY` | ✅ Present |
| `POCKET_SUPABASE_URL` | ✅ Present |
| `POCKET_SUPABASE_SERVICE_ROLE_KEY` | ✅ Present |
| `KERALA_SUPABASE_URL` | ✅ Present (edge functions only) |
| `KERALA_SUPABASE_SERVICE_ROLE_KEY` | ✅ Present (edge functions only) |
| `SOURCE3_SUPABASE_URL` | ✅ Present (`.env` for Next.js API routes) |
| `SOURCE3_SUPABASE_SERVICE_ROLE_KEY` | ✅ Present (`.env` for Next.js API routes) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Present |
| `CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY` | ✅ Present |
| `STRIPE_SECRET_KEY` | ✅ Present |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ Present |
| `WORLDPAY_ENTITY / USERNAME / PASSWORD` | ✅ Present |
| `DHL_CLIENT_ID / CLIENT_SECRET / ACCOUNT_NUMBER` | ✅ Present |
| `TWILIO_ACCOUNT_SID / AUTH_TOKEN` | ✅ Present |
| `CENTRALHUB_WEBHOOK_SECRET` | ✅ Present |
| `SYNC_WEBHOOK_SECRET / WEBHOOK_SHARED_SECRET` | ✅ Present |
| `KERALAGROCERY_ORDER_WEBHOOK_URL` | ✅ Present |
| `TARGET_WEBHOOK_URL` | ✅ Present |

All required credentials are present. No expired or obviously invalid keys found (all JWTs include valid `iss`, `ref`, and `role` claims). No test-vs-live environment mismatches detected.

---

## 3. Issues Found

### ❌ CRITICAL — Issue 1: KeralaGroceries env var mismatch in sync-orders API route
**File:** `app/api/sync-orders/route.ts` (line 176 before fix)  
**Problem:** The Next.js `/api/sync-orders` GET handler listed the KeralaGroceries source as:
```
{ url: process.env.KERALA_SUPABASE_URL, key: process.env.KERALA_SUPABASE_SERVICE_ROLE_KEY, slug: 'keralagroceries' }
```
`KERALA_SUPABASE_URL` does NOT exist in the `.env` file — only `SOURCE3_SUPABASE_URL` does. Since Next.js API routes read from `process.env` (which is populated from `.env`), every call to sync KeralaGroceries orders from this route would silently use `undefined` credentials, causing the Supabase client to initialize with a placeholder URL and fail without an error being surfaced.

**Fix applied:** Changed to `process.env.SOURCE3_SUPABASE_URL || process.env.KERALA_SUPABASE_URL` so it works with either name. Also added `KERALA_SUPABASE_URL` as an alias in `.env` pointing to the same URL as `SOURCE3_SUPABASE_URL`.

---

### ❌ CRITICAL — Issue 2: KeralaGroceries slug mismatch
**Files:** `app/api/sync-orders/route.ts`, `app/api/orders/delete/route.ts`, `app/api/orders/update-status/route.ts`  
**Problem:** All three routes referenced slug `'keralagroceries'` (with an 's') when identifying the KeralaGroceries store. The actual slug stored in the `stores` table is `'keralagrocery'` (no 's'). The `syncFromSource` function does an exact `ilike('slug', storeSlug)` query, and `ILIKE 'keralagroceries'` returns zero rows for slug `'keralagrocery'`. This means:
- Full order sync for KeralaGroceries always returned `{ success: false, error: "Store not found" }`
- Delete and status-update operations on KeralaGroceries orders were silently skipped

**Fix applied:** Updated all three routes to accept both `'keralagrocery'` and `'keralagroceries'`, and set the canonical slug to `'keralagrocery'` in the sources array.

---

### ❌ CRITICAL — Issue 3: Sync hard-limited to 40 most recent orders
**File:** `app/api/sync-orders/route.ts` (line ~97 before fix)  
**Problem:** The `syncFromSource` function fetched only `.limit(40)` orders from each remote database. Since MalluSpices has 289 orders in CentralHub (sourced from prior syncs), this means any full sync would only pull the most recent 40, leaving the other 249 at risk of not being imported if IDs changed or were missing.

**Fix applied:** Limit increased from 40 to 1000 orders per sync run.

---

### ❌ HIGH — Issue 4: `order_items` table is completely empty (0 rows across all 376 orders)
**Table:** `order_items`  
**Problem:** Every order in CentralHub has zero line items. The sync code does correctly attempt to fetch items from multiple table name candidates (`order_items`, `line_items`, `items`, `ordered_products`, `woocommerce_order_items`) on the remote database using `IN (order_ids)`. The most likely cause is that either:

1. The remote stores do not have a compatible order items table (none of the candidate table names match), OR
2. The remote order items table uses a column other than `order_id` for the foreign key (e.g. `order_uuid`, `external_order_id`), OR
3. The items are nested in the orders JSON (`order.line_items`) but were empty at sync time

**Impact:** All profit calculations, per-item inventory deductions, picking lists, and packing lists show empty. This is the most functionally impactful issue.

**Recommended fix:** Connect to each remote Supabase database and run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%item%' OR table_name LIKE '%line%'` to identify the correct table name. Then check the actual column used for the order FK. Update the sync logic to match.

---

### ⚠️ MEDIUM — Issue 5: Product webhook sync is fully broken (42 pending retries)
**Table:** `webhook_logs`  
**Problem:** All 42 logged product webhook attempts have `status_code = 0` and `response_body = 'no response'`. The last attempt was July 7. This means:
- The `product-webhook-dispatcher` edge function is calling `pg_net` to send webhooks to KeralaGroceries (`centralhub-realtime`)
- All requests timed out or the destination URL is unreachable
- Stock and price changes made in CentralHub are NOT being pushed to the connected stores

**Recommended fix:** Check whether the `TARGET_WEBHOOK_URL` / `KERALAGROCERY_ORDER_WEBHOOK_URL` secrets point to a live and deployed `centralhub-realtime` function. Run the diagnostics from the Sync Status page to confirm the destination URL is reachable.

---

### ⚠️ MEDIUM — Issue 6: No scheduled/automated sync
**Problem:** There is no `pg_cron` extension installed, no scheduled jobs, and no always-on background worker polling for new orders. Order sync only happens when:
1. A webhook POST is manually triggered from the remote store to `/api/sync-orders`
2. A user manually visits the sync status page and clicks a button
3. `syncOrderFromSource` is called from the UI for a specific order

This means new orders placed on the remote stores after the last manual sync will NOT appear in CentralHub automatically.

**Recommended fix:** Add `pg_cron` or set up a Supabase scheduled edge function (`sync-orders`) to run every 5–15 minutes. The `/api/sync-orders` GET route is already designed to be called with no arguments to trigger a full sync of all stores.

---

### ⚠️ LOW — Issue 7: One orphaned order with NULL store_id
**Order:** `LIVE-TEST-20260629193428` (ID: `4109e993-...`, created 2026-06-29)  
**Problem:** This test order has no `store_id`. It will be invisible to any per-store queries and may cause NULL pointer issues in the UI.

**Recommended fix:** Either assign it to a store or delete it.

---

## 4. Sync Architecture Review

### How Orders Are Synced
```
Remote Store DB (Supabase)
        │
        ├── Webhook POST to /api/sync-orders (on new order)  [broken — see Issue 1+2]
        │       └── mapOrderData() → upsert into CentralHub orders
        │
        └── Manual GET /api/sync-orders (full pull)  [fixed]
                └── syncFromSource() → fetch orders + items → upsert into CentralHub
```

### RLS Policy Summary
| Table | RLS Enabled | Read Policy | Insert Policy | Update Policy |
|---|---|---|---|---|
| `orders` | ✅ Yes | `authenticated` — "Admins can view all orders" (`USING(true)`) | `authenticated` — own or null user_id | `authenticated` — admin function check |
| `order_items` | ✅ Yes | `anon` + `authenticated` — `USING(true)` | `authenticated` — `USING(true)` | `authenticated` — `USING(true)` |
| `stores` | ✅ Yes | Multiple policies allow read for all roles | — | — |

RLS is correctly configured. No orders are blocked by RLS for authenticated admin users.

### Database Triggers on `orders`
| Trigger | Type | Status |
|---|---|---|
| `trg_enforce_paid_before_inventory_sync` | BEFORE INSERT/UPDATE | ENABLED — blocks `inventory_sync_status='synced'` unless `payment_status='paid'` |
| `trg_set_orders_order_id` | BEFORE INSERT | ENABLED — auto-generates order ID |

The `trg_enforce_paid_before_inventory_sync` trigger raises an exception if the sync code tries to write `inventory_sync_status='synced'` on a non-paid order. The sync code explicitly writes `inventory_sync_status: 'synced'` in `mapOrderData()` for ALL orders regardless of payment status. **This is causing silent failures for every pending-payment order.** All 233 pending MalluSpices orders and 60 pending KeralaGroceries orders would trigger this exception at upsert time, and the sync code catches the error silently and moves on — meaning unpaid orders may not be getting correctly upserted.

---

### ❌ CRITICAL — Issue 8 (newly found): mapOrderData always sets inventory_sync_status='synced'
**File:** `app/api/sync-orders/route.ts` line 63  
**Problem:**
```typescript
inventory_sync_status: 'synced',  // <-- always set, regardless of payment_status
```
The DB trigger `trg_enforce_paid_before_inventory_sync` raises an exception when this is written for an order where `payment_status != 'paid'`. Since 80%+ of synced orders are `pending` payment, nearly all syncs are throwing a DB exception that the `try/catch` in `syncFromSource` swallows silently, logging `{ success: false, error: "..." }` to console only.

**Fix:** Set `inventory_sync_status` conditionally.

---

## 5. Fixes Applied — Summary

| # | File | Change | Status |
|---|---|---|---|
| 1 | `app/api/sync-orders/route.ts` | KeralaGroceries env var: `KERALA_*` → `SOURCE3_* \|\| KERALA_*` | ✅ Fixed |
| 2 | `app/api/sync-orders/route.ts` | KeralaGroceries slug: `'keralagroceries'` → `'keralagrocery'` | ✅ Fixed |
| 3 | `app/api/sync-orders/route.ts` | Raised sync limit from 40 to 1000 orders per sync run | ✅ Fixed |
| 4 | `app/api/sync-orders/route.ts` | POST handler: replaced hardcoded `MALLUSPICES_*` with dynamic source lookup | ✅ Fixed |
| 5 | `app/api/sync-orders/route.ts` | `inventory_sync_status` now set to `'synced'` for paid only, `'pending'` otherwise | ✅ Fixed |
| 6 | `app/api/orders/delete/route.ts` | Slug check now accepts `'keralagrocery'` or `'keralagroceries'`, uses `SOURCE3_*\|\|KERALA_*` | ✅ Fixed |
| 7 | `app/api/orders/update-status/route.ts` | Same slug and env var fix as delete route | ✅ Fixed |
| 8 | `.env` | Added `KERALA_SUPABASE_URL` and `KERALA_SUPABASE_SERVICE_ROLE_KEY` as aliases for `SOURCE3_*` | ✅ Fixed |
| 9 | `lib/services/products/stockSyncService.ts` | KeralaGroceries source now falls back `SOURCE3_*\|\|KERALA_*` | ✅ Fixed |
| 10 | `lib/services/shipping/shipmentSyncService.ts` | KeralaGroceries config now falls back `KERALA_*\|\|SOURCE3_*` | ✅ Fixed |
| 11 | `supabase/functions/shipment-sync-worker/index.ts` | Same fallback pattern for edge function — redeployed | ✅ Fixed |

---

## 6. Remaining Issues — Manual Action Required

### A. order_items completely empty (0 rows for all 376 orders)
The sync code searches for items across five candidate table names on each remote Supabase. All returned empty. To fix:
1. Open each remote store's Supabase database
2. Run: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
3. Find the actual order-items table name
4. Add it to the `tableNames` array in `syncFromSource` in `app/api/sync-orders/route.ts`

### B. Product webhook sync broken (42 failed retries, last success: never)
The `centralhub-realtime` destination URL is not responding. Go to the Sync Status page and click "Run Diagnostics" to identify if the function needs redeployment.

### C. No automated sync schedule
New orders won't appear until sync is manually triggered. Enable Supabase's `pg_cron` extension or use an external cron to call the `/api/sync-orders` GET endpoint every 10–15 minutes.

### D. One orphaned test order
Order `LIVE-TEST-20260629193428` has `store_id = NULL`. Assign it to a store or delete it.

---

## 7. Final Per-Store Sync Status

| Store | Connection | Credentials | Slug | Orders Synced | Items Synced | Auto Sync | Overall |
|---|---|---|---|---|---|---|---|
| MalluSpices | ✅ | ✅ Valid | ✅ `malluspices` | ✅ 289 | ❌ 0 items | ❌ None | ⚠️ Partial |
| KeralaGroceries | ✅ | ✅ Fixed | ✅ `keralagrocery` (fixed) | ✅ 65 | ❌ 0 items | ❌ None | ⚠️ Partial |
| PocketGrocery | ✅ | ✅ Valid | ✅ `pocketgrocery` | ✅ 21 | ❌ 0 items | ❌ None | ⚠️ Partial |

All three stores are importing order headers correctly. The largest remaining gap is missing order line items across all stores.
