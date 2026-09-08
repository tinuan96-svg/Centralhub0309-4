# Store-originated order synchronisation checklist

CentralHub no longer creates customer orders. Test orders must begin in a connected storefront or payment flow.

## 1. Order Queue

- Open /orders.
- Confirm the page loads, existing orders are listed, and no New Order control is displayed.
- Confirm store scope, status filters, Sync All, retry, detail, shipment, payment, refund, and status actions remain available.

## 2. Inbound store synchronisation

- Create or use a test order in the appropriate storefront test flow.
- Run Sync All or the approved scheduled sync.
- Confirm the order appears once in CentralHub with the originating store, source order number, items, payment state, and sync state.
- Confirm mismatch reporting does not create a duplicate order.

## 3. Inventory and payment

- Confirm an unpaid imported order does not deduct stock.
- Confirm a paid order follows the existing database inventory trigger and creates the expected inventory audit entry.
- Confirm payment confirmation, fee reconciliation, and customer communication behaviour remain intact.

## 4. Fulfilment and outbound sync

- Change an imported order through the permitted fulfilment statuses.
- Confirm order status history is written.
- Confirm the originating store receives the permitted status or shipment update.
- Confirm a failed outbound update is visible and retryable.

## 5. Cancellation and refund

- Cancel or refund an existing imported order through the approved CentralHub action.
- Confirm the expected inventory restoration, payment state, audit entry, and store update.
- Confirm no new order is created as a side effect.

## 6. Mollie and other payment webhooks

- Confirm payment webhooks update the existing order.
- Confirm Mollie audit events remain visible in Mollie Audit Centre.
- Confirm no payment event calls a CentralHub customer-order creation route.

## 7. Regression checks

- Run the feature continuity audit, route audit, typecheck, production build, and post-build smoke audit.
- Confirm no storefront checkout, inbound order sync, CentralHub status sync, refund sync, picking, packing, shipping, or notification flow is removed.
