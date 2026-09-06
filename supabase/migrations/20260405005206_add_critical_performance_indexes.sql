/*
  # Add Critical Performance Indexes

  1. Purpose
    - Add essential indexes for frequently queried fields
    - Improve dashboard and table load times
    - Optimize common filtering operations

  2. Indexes Added
    - Products: name, sku, is_active, created_at
    - Orders: created_at, customer_email
    - Central inventory: product_id
    - Store products: composite indexes
    - Order items: order_id, product_id

  3. Impact
    - Faster product searches and filtering
    - Quicker order lookups
    - Improved inventory queries
    - Better overall system responsiveness
*/

-- Products table indexes (core search and filtering)
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted) WHERE is_deleted = false;

-- Orders table indexes (core lookups)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

-- Central inventory indexes
CREATE INDEX IF NOT EXISTS idx_central_inventory_product_id ON central_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_central_inventory_low_stock ON central_inventory(stock_quantity) WHERE stock_quantity <= low_stock_threshold;

-- Store products indexes (composite for common queries)
CREATE INDEX IF NOT EXISTS idx_store_products_store_product ON store_products(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_active ON store_products(store_id, is_active) WHERE is_active = true;

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Pricing rules indexes
CREATE INDEX IF NOT EXISTS idx_pricing_rules_store_active ON pricing_rules(store_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_priority ON pricing_rules(priority DESC);

-- Analyze key tables for query planner optimization
ANALYZE products;
ANALYZE orders;
ANALYZE central_inventory;
ANALYZE store_products;
ANALYZE order_items;