# Order-Inventory Synchronization System

## Overview

A comprehensive, fully automated order-to-inventory synchronization system that ensures real-time inventory accuracy across all order lifecycle stages. The system is designed to support **Backorders**, meaning stock levels can go negative to track "stock debt" for products that allow it.

## Architecture

### Database Components

1. **orders table** (extended)
   - `inventory_sync_status` - Tracks sync state (pending, synced, failed, partial)
   - `inventory_synced_at` - Timestamp of last successful sync
   - `stock_deducted` - Boolean flag to prevent double deduction

2. **order_status_history table**
   - Audit trail for all status changes
   - Tracks inventory actions and completion status
   - Prevents duplicate operations (idempotent)

3. **central_inventory table** (Source of Truth)
   - Single source of truth for stock
   - `stock_quantity` - Current physical stock (can be negative for backorders)
   - `reserved_quantity` - **DEPRECATED** (Legacy system removed to allow simpler backorder flow)

4. **inventory_logs table**
   - Complete audit trail of all inventory changes
   - Links to order IDs for traceability

### Service Layer

**OrderService** (`lib/services/orderService.ts`)
- Handles complete order lifecycle
- Automatic inventory synchronization via database triggers and service calls
- Transaction-safe operations
- Validation before order creation (checks if backorder is allowed)

**InventoryService** (`lib/services/inventoryService.ts`)
- Low-level inventory operations
- Update, deduct, and return stock
- Audit logging

## Order Lifecycle → Inventory Actions

### 1. Order Creation (PENDING_PAYMENT)
**Inventory Action:** NONE

```typescript
// Workflow:
1. Validate if product exists and if backorder is allowed if stock is low
2. Create order record with temporary order number (TEMP-...)
3. Create order items
4. Create status history entry
```

**Inventory Impact:**
- No change to `stock_quantity`.
- No reservations are made. Stock is only "claimed" when paid.

### 2. Payment Confirmed (PAID)
**Inventory Action:** DEDUCT (Automatic via DB Trigger)

**Trigger:** `handle_order_inventory_movement` on `orders` table.

**Inventory Impact:**
- `stock_quantity` decreases by order quantity immediately.
- If `stock_quantity` was 5 and order is for 10 → `stock_quantity` becomes -5.
- permanent order number (e.g., KG2501) is assigned.

### 3. Order Cancelled
**Inventory Action:** NONE (if not yet paid) or RESTORE (if already paid)

**Inventory Impact:**
- If the order was never paid (`stock_deducted = false`) → No inventory change.
- If the order was paid (`stock_deducted = true`) → `stock_quantity` increases by order quantity.

### 4. Order Refunded
**Inventory Action:** RETURN (add back to stock)

```typescript
await OrderService.refundOrder(orderId, "Customer return");
```

**Inventory Impact:**
- `stock_quantity` increases by order quantity.
- Stock returns to inventory for future orders.

## Safety Mechanisms

### 1. Validation Before Creation
```typescript
const validation = await OrderService.validateInventoryForOrder(items);
if (!validation.valid) {
  // Checks products.allow_backorder. If true, allows "insufficient" stock.
  return { order: null, error: "Insufficient stock" };
}
```

### 2. Idempotent Operations
- `stock_deducted` flag on orders prevents double-deduction.
- Database triggers handle the transition to 'paid' status atomically.

### 3. Backorder Support
- Database constraints requiring `stock_quantity >= 0` have been **REMOVED**.
- This allows the business to continue selling high-demand items while procurement catches up.

### 4. Complete Audit Trail
Every inventory change is logged in `inventory_logs`.

## Testing Guide

### Test 1: Paid Order (Stock Deduction)
1. Create order for 5 units of Product A.
2. Mark order as Paid.
3. **Verify:** `central_inventory.stock_quantity` decreased by 5.

### Test 2: Backorder Flow
1. Product B has 0 stock and `allow_backorder = true`.
2. Create and Pay for order of 2 units.
3. **Verify:** `central_inventory.stock_quantity` becomes -2.

### Test 3: Refund (Stock Restoration)
1. Refund a Paid order.
2. **Verify:** `central_inventory.stock_quantity` increases back to original.
3. **Verify:** `inventory_logs` shows a `RETURN` entry.

## Monitoring & Alerts

### Consistency Check
```sql
-- Find orders where status is PAID but stock wasn't deducted (Sync Failure)
SELECT order_number FROM orders 
WHERE payment_status = 'paid' AND stock_deducted = false;
```

### Stock Debt (Backorders)
```sql
-- View all products currently in "stock debt"
SELECT product_id, stock_quantity FROM central_inventory
WHERE stock_quantity < 0;
```

## Monitoring & Alerts

### Check Sync Status
```sql
SELECT
  inventory_sync_status,
  COUNT(*) as count
FROM orders
GROUP BY inventory_sync_status;
```

### Find Failed Syncs
```sql
SELECT
  order_number,
  order_status,
  inventory_sync_status,
  created_at
FROM orders
WHERE inventory_sync_status = 'failed'
ORDER BY created_at DESC;
```

### Audit Trail
```sql
SELECT
  h.*,
  o.order_number
FROM order_status_history h
JOIN orders o ON h.order_id = o.id
WHERE h.inventory_action_completed = false
ORDER BY h.created_at DESC;
```

### Inventory Consistency Check
```sql
-- Find products with invalid reserved quantities
SELECT *
FROM central_inventory
WHERE reserved_quantity > stock_quantity
   OR reserved_quantity < 0
   OR stock_quantity < 0;
```

## Integration Points

### Frontend (Orders Page)
- View all orders with sync status
- Update order status with one click
- View complete status history
- See inventory impact for each action

### API Endpoints (Future)
```typescript
POST   /api/orders              - Create order
PATCH  /api/orders/:id/status   - Update status
POST   /api/orders/:id/cancel   - Cancel order
POST   /api/orders/:id/refund   - Refund order
GET    /api/orders/:id/history  - Get status history
```

## Error Handling

All errors return structured responses:

```typescript
{
  success: boolean,
  error: string | null,
  order?: Order
}
```

Common errors:
- `"Insufficient stock (available: X, requested: Y)"`
- `"Order not found"`
- `"Failed to reserve inventory"`
- `"Product not found in inventory"`

## Best Practices

1. **Always validate before creating orders**
   ```typescript
   const validation = await OrderService.validateInventoryForOrder(items);
   ```

2. **Use status update methods, not direct updates**
   ```typescript
   // ✅ Good
   await OrderService.updateOrderStatus(orderId, 'shipped');

   // ❌ Bad
   await supabase.from('orders').update({ order_status: 'shipped' });
   ```

3. **Check sync status before retrying**
   ```typescript
   if (order.inventory_sync_status === 'failed') {
     // Investigate before retrying
   }
   ```

4. **Monitor inventory logs regularly**
   ```typescript
   const logs = await InventoryService.getInventoryLogs(productId);
   ```

5. **Never manually update inventory for orders**
   - Always use OrderService methods
   - Automatic logging and validation
   - Transaction safety guaranteed

## Future Enhancements

1. **Automatic Retry for Failed Syncs**
   - Background job to retry failed inventory syncs
   - Configurable retry limits

2. **Webhook Notifications**
   - Alert on low stock
   - Notify on sync failures
   - Order status updates

3. **Inventory Forecasting**
   - Predict when products will be out of stock
   - Based on reservation trends

4. **Multi-warehouse Support**
   - Route orders to nearest warehouse
   - Balance inventory across locations

5. **Partial Fulfillment**
   - Support for partial shipments
   - Split inventory reservations

## Summary

The order-inventory sync system provides:

✅ Automatic inventory synchronization
✅ Transaction-safe operations
✅ Complete audit trail
✅ Validation before order creation
✅ Idempotent status updates
✅ Rollback on failures
✅ Real-time inventory accuracy
✅ Constraint enforcement
✅ Performance optimized
✅ Production ready

No manual intervention required. Every order action automatically updates inventory correctly.
