# Order Numbering System

## Overview

The order numbering system has been updated to support store-specific prefixes and payment confirmation workflows.

## Order Number Format

### Store-Specific Prefixes

Orders are assigned permanent numbers based on the store where they're placed:

- **KeralaGroceries**: `KG2501`, `KG2502`, `KG2503`, ...
- **PocketGrocery**: `PG2501`, `PG2502`, `PG2503`, ...

### Payment Status Workflow

1. **Order Creation (Pending Payment)**
   - Orders are created with a temporary order number: `TEMP-{timestamp}-{random}`
   - Example: `TEMP-1704398745123-456`
   - This number is used until payment is confirmed

2. **Payment Confirmation**
   - When payment status changes to `paid`, a permanent store-specific order number is assigned
   - The temporary number is replaced with the permanent number (e.g., `KG2501`)
   - This ensures only confirmed orders consume the sequential number series

## Database Changes

### Migration: `add_store_to_orders`

Added `store_id` column to the `orders` table to track which store the order belongs to.

```sql
ALTER TABLE orders ADD COLUMN store_id uuid REFERENCES stores(id);
```

## Code Changes

### Updated Types

**Order Interface**:
- Added `store_id: string | null` field

**CreateOrderData Interface**:
- Added required `store_id: string` field

### Order Service Methods

**New Methods**:

1. `generateTemporaryOrderNumber()`: Creates temporary order numbers for pending payments
2. `generatePermanentOrderNumber(storeId)`: Generates store-specific sequential numbers
3. `confirmPayment(orderId, paymentReference?)`: Confirms payment and assigns permanent order number
4. `updatePaymentStatus(orderId, paymentStatus, paymentReference?)`: Updates payment status

## Usage

### Creating an Order

Orders must now include a `store_id`:

```typescript
const orderData: CreateOrderData = {
  store_id: 'store-uuid-here',
  customer_name: 'John Doe',
  customer_email: 'john@example.com',
  // ... other fields
  items: [...]
};

const { order, error } = await OrderService.createOrder(orderData);
// Order created with temporary number: TEMP-1704398745123-456
```

### Confirming Payment

```typescript
const { success, orderNumber, error } = await OrderService.confirmPayment(
  orderId,
  'payment-reference-123'
);
// Returns: { success: true, orderNumber: 'KG2501', error: null }
```

### UI Updates

The Orders page now includes:
- **Payment Status Column**: Shows pending, paid, failed, or refunded
- **Confirm Payment Button**: Appears for orders with pending payment
- **Process Button**: Only shows for orders with confirmed payment

## Benefits

1. **Clean Number Series**: Only confirmed orders consume sequential numbers
2. **Store Tracking**: Easy to identify which store an order belongs to
3. **Payment Workflow**: Clear separation between pending and confirmed orders
4. **Audit Trail**: Temporary numbers provide tracking even for abandoned orders
