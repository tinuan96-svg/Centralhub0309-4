# Order-Inventory Sync Testing Checklist

Use this checklist to verify the order-inventory synchronization system works correctly.

## Prerequisites

1. ✅ Database migration applied
2. ✅ At least one product with inventory (stock_quantity > 0)
3. ✅ Orders page accessible at `/orders`

## Test Scenarios

### ✅ Test 1: View Orders Page

**Steps:**
1. Navigate to http://localhost:3000/orders
2. Verify the page loads without errors
3. Check statistics cards display correctly
4. Verify existing orders are listed

**Expected Results:**
- Page loads successfully
- Stats show: Total, Pending, Processing, Shipped, Delivered, Cancelled
- Orders table shows order details with sync status

---

### ✅ Test 2: Order Status History

**Steps:**
1. Click "History" button on any order
2. Verify modal opens
3. Check timeline shows status changes

**Expected Results:**
- Modal displays order items
- Status timeline shows all transitions
- Inventory actions shown (reserve, commit, release, return)
- Completion status indicated with ✓ or ✗

---

### ✅ Test 3: Create New Order (Manual Test in DB)

**Steps:**
```sql
-- 1. Check current inventory
SELECT product_id, stock_quantity, reserved_quantity,
       (stock_quantity - reserved_quantity) as available
FROM central_inventory
WHERE product_id = 'YOUR_PRODUCT_ID';

-- 2. Note the values: stock_quantity, reserved_quantity, available

-- 3. Create order using OrderService (in browser console or via API)
```

**Browser Console Test:**
```javascript
// You can add this to a test page or use the browser console
const OrderService = require('./lib/services/orderService').OrderService;

const result = await OrderService.createOrder({
  customer_name: "Test Customer",
  customer_email: "test@example.com",
  customer_phone: "1234567890",
  delivery_address: "123 Test St",
  delivery_city: "Test City",
  delivery_postcode: "TE5T 1NG",
  payment_method: "card",
  items: [
    {
      product_id: "YOUR_PRODUCT_ID",
      product_name: "Test Product",
      quantity: 2,
      unit_price: 1000
    }
  ]
});

console.log('Order created:', result);
```

**Expected Results:**
```sql
-- 4. Check inventory after order creation
SELECT product_id, stock_quantity, reserved_quantity,
       (stock_quantity - reserved_quantity) as available
FROM central_inventory
WHERE product_id = 'YOUR_PRODUCT_ID';

-- Expected changes:
-- stock_quantity: UNCHANGED
-- reserved_quantity: INCREASED by 2
-- available: DECREASED by 2
```

**Verify in inventory_logs:**
```sql
SELECT *
FROM inventory_logs
WHERE type = 'ORDER'
ORDER BY created_at DESC
LIMIT 5;

-- Should show: change = -2, notes = "Reserved 2 units for order"
```

---

### ✅ Test 4: Process Order (Pending → Processing)

**Steps:**
1. Find a pending order in Orders page
2. Click "Process" button
3. Confirm the action

**Expected Results:**
- Order status changes to "Processing"
- Inventory sync status shows "synced"
- reserved_quantity: UNCHANGED (stock stays reserved)
- stock_quantity: UNCHANGED
- History shows transition with "none" inventory action

---

### ✅ Test 5: Ship Order (Processing → Shipped)

**Steps:**
1. Find a processing order
2. Click "Ship" button
3. Confirm the action

**SQL Verification:**
```sql
-- Before shipping
SELECT stock_quantity, reserved_quantity
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';

-- Click "Ship"

-- After shipping
SELECT stock_quantity, reserved_quantity
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';
```

**Expected Results:**
- Order status: "Shipped"
- stock_quantity: DECREASED by order quantity
- reserved_quantity: DECREASED by order quantity
- available: UNCHANGED (both decreased)
- inventory_logs: Shows "Committed X units for order completion"

---

### ✅ Test 6: Cancel Order (Release Stock)

**Steps:**
1. Find a pending or processing order
2. Click "Cancel" button
3. Enter optional reason
4. Confirm

**SQL Verification:**
```sql
-- Note values before cancellation
SELECT stock_quantity, reserved_quantity,
       (stock_quantity - reserved_quantity) as available
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';

-- Cancel order

-- Check after cancellation
SELECT stock_quantity, reserved_quantity,
       (stock_quantity - reserved_quantity) as available
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';
```

**Expected Results:**
- Order status: "Cancelled"
- stock_quantity: UNCHANGED
- reserved_quantity: DECREASED by order quantity
- available: INCREASED by order quantity (stock released)
- inventory_logs: "Released X units (order cancelled)"

---

### ✅ Test 7: Refund Order (Return Stock)

**Steps:**
1. Find a delivered order
2. Click "Refund" button
3. Enter refund reason
4. Confirm stock return

**SQL Verification:**
```sql
-- Before refund
SELECT stock_quantity, reserved_quantity
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';

-- Refund order

-- After refund
SELECT stock_quantity, reserved_quantity
FROM central_inventory
WHERE product_id = 'PRODUCT_IN_ORDER';
```

**Expected Results:**
- Payment status: "Refunded"
- stock_quantity: INCREASED by order quantity
- reserved_quantity: UNCHANGED (was already 0)
- inventory_logs type: "RETURN", shows positive change

---

### ✅ Test 8: Insufficient Stock Validation

**Steps:**
```sql
-- 1. Find a product with low stock
SELECT product_id, stock_quantity, reserved_quantity,
       (stock_quantity - reserved_quantity) as available
FROM central_inventory
WHERE (stock_quantity - reserved_quantity) < 100
LIMIT 1;

-- 2. Try to create order with quantity > available
```

**Expected Results:**
- Order creation FAILS
- Error message: "Insufficient stock (available: X, requested: Y)"
- No order created in database
- Inventory unchanged

---

### ✅ Test 9: Inventory Consistency Check

**Run these queries to ensure data integrity:**

```sql
-- 1. No negative stock
SELECT *
FROM central_inventory
WHERE stock_quantity < 0 OR reserved_quantity < 0;
-- Expected: 0 rows

-- 2. No over-reservation
SELECT *
FROM central_inventory
WHERE reserved_quantity > stock_quantity;
-- Expected: 0 rows

-- 3. All orders have sync status
SELECT COUNT(*)
FROM orders
WHERE inventory_sync_status IS NULL;
-- Expected: 0

-- 4. Verify inventory logs exist for all synced orders
SELECT o.order_number, o.inventory_sync_status
FROM orders o
WHERE o.inventory_sync_status = 'synced'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_logs
    WHERE reference_id = o.id
  );
-- Expected: 0 rows (all synced orders should have logs)
```

---

### ✅ Test 10: Complete Order Lifecycle

**Steps:**
1. Create order → verify stock reserved
2. Process order → verify stock still reserved
3. Ship order → verify stock committed
4. Deliver order → verify no additional changes
5. Check inventory logs → verify complete audit trail

**SQL Audit:**
```sql
-- View complete history for an order
SELECT
  h.created_at,
  h.old_status,
  h.new_status,
  h.inventory_action,
  h.inventory_action_completed,
  h.notes
FROM order_status_history h
WHERE h.order_id = 'YOUR_ORDER_ID'
ORDER BY h.created_at ASC;

-- Expected sequence:
-- 1. null → pending, reserve, completed
-- 2. pending → processing, none, completed
-- 3. processing → shipped, commit, completed
-- 4. shipped → delivered, none, completed
```

---

## Performance Tests

### Test 11: Concurrent Order Creation

**Steps:**
```javascript
// Create multiple orders on same product simultaneously
const productId = "SAME_PRODUCT_ID";

const orderPromises = Array.from({ length: 5 }, (_, i) =>
  OrderService.createOrder({
    customer_name: `Test ${i}`,
    customer_email: `test${i}@example.com`,
    customer_phone: "1234567890",
    delivery_address: "123 Test St",
    delivery_city: "Test",
    delivery_postcode: "TE5T",
    payment_method: "card",
    items: [{
      product_id: productId,
      product_name: "Test Product",
      quantity: 10,
      unit_price: 1000
    }]
  })
);

const results = await Promise.all(orderPromises);
console.log('Results:', results);
```

**Expected Results:**
- Only orders with sufficient stock succeed
- Failed orders have clear error messages
- reserved_quantity is accurate
- No overselling
- Database constraints prevent invalid states

---

### Test 12: Status History Audit

**Steps:**
```sql
-- Find orders with incomplete inventory actions
SELECT
  o.order_number,
  h.old_status,
  h.new_status,
  h.inventory_action,
  h.inventory_action_completed,
  h.notes
FROM order_status_history h
JOIN orders o ON h.order_id = o.id
WHERE h.inventory_action_completed = false
ORDER BY h.created_at DESC;
```

**Expected Results:**
- Ideally 0 rows (all actions completed successfully)
- Any incomplete actions should be investigated

---

## Quick Health Check

Run this query for a system overview:

```sql
SELECT
  'Total Orders' as metric,
  COUNT(*) as value
FROM orders

UNION ALL

SELECT
  'Pending Sync' as metric,
  COUNT(*) as value
FROM orders
WHERE inventory_sync_status = 'pending'

UNION ALL

SELECT
  'Failed Sync' as metric,
  COUNT(*) as value
FROM orders
WHERE inventory_sync_status = 'failed'

UNION ALL

SELECT
  'Total Reserved Stock' as metric,
  SUM(reserved_quantity) as value
FROM central_inventory

UNION ALL

SELECT
  'Products Low Stock' as metric,
  COUNT(*) as value
FROM central_inventory
WHERE (stock_quantity - reserved_quantity) <= low_stock_threshold

UNION ALL

SELECT
  'Products Out of Stock' as metric,
  COUNT(*) as value
FROM central_inventory
WHERE (stock_quantity - reserved_quantity) <= 0;
```

---

## Success Criteria

All tests pass when:

- ✅ Orders page loads without errors
- ✅ Order creation reserves stock correctly
- ✅ Status updates trigger correct inventory actions
- ✅ Cancelled orders release stock
- ✅ Refunded orders return stock
- ✅ Insufficient stock orders are rejected
- ✅ No negative stock quantities
- ✅ No over-reservation (reserved > stock)
- ✅ All status changes logged in history
- ✅ Inventory logs match order actions
- ✅ Concurrent orders handled safely
- ✅ No failed sync statuses (or properly handled)

## Troubleshooting

### Order creation fails
- Check product has inventory record
- Verify available stock > requested quantity
- Check database constraints

### Inventory not updating
- Check order.inventory_sync_status
- View order_status_history for errors
- Check inventory_logs table

### Negative stock
- **Should never happen** due to constraints
- If found, indicates constraint bypass
- Investigate immediately

### Failed sync status
- Check order_status_history for details
- Verify inventory records exist
- Check for constraint violations
