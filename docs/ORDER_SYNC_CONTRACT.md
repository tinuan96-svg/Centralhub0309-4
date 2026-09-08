# CentralHub Order-Sync Contract

This is a protected continuity contract for the CentralHub multi-store order flow.

## Canonical path

`browser UI → POST /api/sync-orders → sync-orders Edge Function → remote store Supabase → CentralHub orders/order_items`

- Browser code must use `syncOrders()` from `lib/services/orderSyncClient.ts`.
- Browser code must not call `supabase.functions.invoke('sync-orders')` directly.
- `app/api/sync-orders/route.ts` is the server-side secret boundary. It forwards the request with the private sync secret.
- The Edge Function remains responsible for reading the connected store databases and persisting into CentralHub.
- Keep the private service-role keys and sync secrets out of browser bundles.

## Store identity

Canonical store slugs are:

- `malluspices`
- `keralagrocery`
- `pocketgrocery`
- `tamilretail`

The legacy alias `keralagroceries` is normalized to `keralagrocery`; it must not be reintroduced as a separate store.

## Order and inventory invariants

- Existing `orders` and `order_items` tables remain the source of truth for CentralHub operations.
- A source refresh imports an order with `sync_state = 'synced'` and clears `sync_error`.
- A source refresh must not claim inventory was deducted: unpaid orders use `inventory_sync_status = 'pending'` and `stock_deducted = false`.
- Inventory may become `synced` only through the existing paid-order/inventory trigger flow.
- Do not change the established order status/payment status mapping in `supabase/functions/sync-orders/index.ts` without an explicit migration and regression test.
- Missing product mappings are reported as warnings/mismatches; they must not silently create unrelated products or corrupt order identity.
- Order identity is preserved by remote order ID first, with the existing store-scoped order-number reconciliation.

## Notification invariant

The sync operation must be idempotent. Concurrent UI mounts must share one in-flight request so one source order cannot generate duplicate CentralHub notifications from the browser.

Automatic order notifications are payment-gated at every notification boundary (the sync Edge Function and the legacy authenticated push route):

- A new-order or payment-confirmed notification is allowed only when the source order explicitly reports a successful payment (paid, completed, success, confirmed, or an equivalent authorised state).
- pending, failed, refunded, cancelled, unpaid, and unknown payment states must never generate an automatic order notification.
- Do not infer payment success from operational status alone.
- The existing notification dedupe key remains EVENT_TYPE:source_order_id.
- Store identity for notifications comes from the canonical stores.id/stores.slug mapping. Web notifications use the store asset under public/notification-logos/; native Android notifications use the matching local store icon.

## Change rule

Any future order-sync change must:

1. keep the canonical browser client and server proxy;
2. preserve the store slugs and order/status fields;
3. run the order-sync contract audit;
4. verify the deployed Edge Function and a live sync response before release.


## Customer-care notification invariant

- Inbound customer messages must not create an immediate push while AI customer care is actively processing or has successfully replied.
- The customer-message watchdog is the only timeout path: it alerts after more than 10 minutes without a successful outbound reply.
- An active AI-processing window and an open human-assistance ticket suppress duplicate timeout alerts.
- AI-created human-assistance tickets generate an immediate support notification, keyed by `AI_ESCALATION:<ticket_id>` so retries remain idempotent.
- Preserve these rules independently of the order-sync notification flow and its payment gate.
