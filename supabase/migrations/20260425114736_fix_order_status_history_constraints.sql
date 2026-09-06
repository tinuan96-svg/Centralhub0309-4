/*
  # Fix order_status_history status constraints

  The order_status_history table's old_status and new_status check constraints
  were missing 'packing' and 'refunded' values that exist in the orders table.
  This caused status transitions FROM or TO 'packing'/'refunded' to fail when
  creating the audit history entry.

  Changes:
  - Drop and recreate old_status check to include 'packing' and 'refunded'
  - Drop and recreate new_status check to include 'packing' and 'refunded'
*/

ALTER TABLE order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_old_status_check;

ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_old_status_check
  CHECK (
    old_status IS NULL OR
    old_status = ANY (ARRAY[
      'pending', 'confirmed', 'packing', 'processing',
      'shipped', 'delivered', 'cancelled', 'refunded'
    ])
  );

ALTER TABLE order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;

ALTER TABLE order_status_history
  ADD CONSTRAINT order_status_history_new_status_check
  CHECK (
    new_status = ANY (ARRAY[
      'pending', 'confirmed', 'packing', 'processing',
      'shipped', 'delivered', 'cancelled', 'refunded'
    ])
  );
