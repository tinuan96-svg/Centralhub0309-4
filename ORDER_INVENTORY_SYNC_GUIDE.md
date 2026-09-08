# Order and inventory synchronisation

## Current architecture

Orders are created through the connected storefronts. CentralHub is the operational system for imported orders: it receives them, matches items to CentralHub products, applies the existing inventory triggers, and manages fulfilment and outbound status synchronisation.

CentralHub must not create a new customer order directly.

## Store-originated lifecycle

1. A customer completes checkout on a storefront.
2. The storefront records the order, payment state, items, and source identifiers.
3. CentralHub pulls or receives the order through the inbound sync and reports mismatches without creating a duplicate.
4. Existing database triggers and inventory services apply the correct paid, cancelled, and refunded stock movements.
5. Staff process fulfilment in CentralHub.
6. Status, shipment, cancellation, refund, and permitted payment updates are synchronised back to the originating store.

## Inventory rules

- Unpaid imported orders do not deduct stock.
- Paid orders use the existing database inventory trigger and audit trail.
- Cancelled or refunded orders use the existing restoration rules.
- Backorder behaviour remains controlled by the product and inventory configuration.
- Never edit stock manually to compensate for a sync issue; inspect order status, inventory logs, and sync state first.

## CentralHub operations

The Orders page supports:

- viewing and filtering imported orders;
- running or retrying inbound synchronisation;
- reviewing status history and inventory impact;
- updating fulfilment and payment state for an existing order;
- cancelling, refunding, printing, and creating shipments where permitted.

There is no CentralHub customer-order creation endpoint or UI.

## Verification queries

Use the existing order, order_items, order_status_history, inventory_logs, and sync-state tables to verify:

- imported orders retain their originating store and order number;
- each paid/cancelled/refunded transition has the expected inventory audit entry;
- failed or partial synchronisations are visible and retryable;
- outbound status updates are recorded as synced or failed.

## Safety boundary

The source storefront checkout and CentralHub two-way sync functions are continuity-critical. Changes to the CentralHub order queue must preserve inbound sync, mismatch reporting, status/refund sync, and manual single-order refresh.
