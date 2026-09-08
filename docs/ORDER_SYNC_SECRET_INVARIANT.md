# Order Sync Secret Invariant

This file is the non-negotiable boundary for CentralHub order syncing.

## Protected flow

- Browser callers use lib/services/orderSyncClient.ts.
- That client calls the same-origin /api/sync-orders route.
- The Next.js server route forwards to the private sync-orders Edge Function.
- The Edge Function reads store data and persists CentralHub orders and order_items using the existing status, inventory, and notification rules.

## Authentication invariant

- Production Netlify runtime and the Supabase sync-orders Edge Function must both have CENTRALHUB_PUSH_API_SECRET set to the same value.
- The proxy sends that value only in a server-side Authorization header. It must never be exposed through NEXT_PUBLIC_* variables or browser code.
- Never use SUPABASE_SERVICE_ROLE_KEY as a browser credential or as a replacement bearer token for this flow.
- Existing CENTRALHUB_WEBHOOK_SECRET callers remain supported for store webhooks.
- If the sync secret is rotated, update both production secret stores before deploying and verify a targeted sync before a full sync.

## Do not change

- Do not add direct browser calls to supabase.functions.invoke('sync-orders').
- Do not bypass /api/sync-orders, change the order/status mapping, mark unpaid inventory as synced, or remove notification idempotency.
- Do not change the Edge Function JWT/custom-auth boundary without a reviewed migration for every existing store webhook caller.

Run npm run audit:order-sync before merging changes that touch Orders, Topbar, AppLayout, SyncStatus, orderService, or sync routes.
