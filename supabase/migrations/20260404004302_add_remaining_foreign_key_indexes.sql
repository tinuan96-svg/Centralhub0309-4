/*
  # Add Remaining Foreign Key Indexes

  Adds indexes for the remaining unindexed foreign keys:
  - packing_learning_data (3 indexes)
  - product_expiry (1 index)
  - shipment_events (1 index)
*/

-- Packing Learning Data foreign keys
CREATE INDEX IF NOT EXISTS idx_packing_learning_data_actual_box_id ON packing_learning_data(actual_box_id);
CREATE INDEX IF NOT EXISTS idx_packing_learning_data_order_id ON packing_learning_data(order_id);
CREATE INDEX IF NOT EXISTS idx_packing_learning_data_suggested_box_id ON packing_learning_data(suggested_box_id);

-- Product Expiry foreign key
CREATE INDEX IF NOT EXISTS idx_product_expiry_product_id ON product_expiry(product_id);

-- Shipment Events foreign key
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id);

SELECT '✅ Added 5 missing foreign key indexes' as status;
