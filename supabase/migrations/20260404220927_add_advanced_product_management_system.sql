/*
  # Add Advanced Product Management System

  1. New Tables
    - `product_variants` - Variable products (size, weight variations)
    - `product_bundles` - Bundle/combo products
    - `product_batches` - Inventory batch tracking
    - `product_suppliers` - Multiple suppliers per product
    - `product_warehouse_locations` - Warehouse tracking
    - `product_marketing_tags` - Marketing flags

  2. Enhanced Columns for products table
    - product_type, rich_description, brand, weight, dimensions
    - storage_type, enable_stock_tracking, low_stock_threshold
    - SEO fields, admin notes

  3. Purpose
    - Complete product lifecycle management
    - Multi-store pricing and inventory
    - Supplier relationship management
    - Marketing optimization

  4. Security
    - Enable RLS on all tables
*/

-- Add new columns to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE products ADD COLUMN product_type text DEFAULT 'simple' CHECK (product_type IN ('simple', 'variable', 'bundle'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'rich_description'
  ) THEN
    ALTER TABLE products ADD COLUMN rich_description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'brand'
  ) THEN
    ALTER TABLE products ADD COLUMN brand text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'weight_grams'
  ) THEN
    ALTER TABLE products ADD COLUMN weight_grams numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'dimensions_cm'
  ) THEN
    ALTER TABLE products ADD COLUMN dimensions_cm jsonb DEFAULT '{"length": 0, "width": 0, "height": 0}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'storage_type'
  ) THEN
    ALTER TABLE products ADD COLUMN storage_type text DEFAULT 'ambient' CHECK (storage_type IN ('ambient', 'refrigerated', 'frozen'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'enable_stock_tracking'
  ) THEN
    ALTER TABLE products ADD COLUMN enable_stock_tracking boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'low_stock_threshold'
  ) THEN
    ALTER TABLE products ADD COLUMN low_stock_threshold integer DEFAULT 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'seo_meta_title'
  ) THEN
    ALTER TABLE products ADD COLUMN seo_meta_title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'seo_meta_description'
  ) THEN
    ALTER TABLE products ADD COLUMN seo_meta_description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE products ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'custom_attributes'
  ) THEN
    ALTER TABLE products ADD COLUMN custom_attributes jsonb DEFAULT '{}';
  END IF;
END $$;

-- Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name text NOT NULL,
  sku_suffix text,
  attributes jsonb DEFAULT '{}',
  price_adjustment numeric(10,2) DEFAULT 0,
  stock integer DEFAULT 0,
  weight_grams numeric(10,2),
  dimensions_cm jsonb DEFAULT '{"length": 0, "width": 0, "height": 0}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create product_bundles table
CREATE TABLE IF NOT EXISTS product_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  discount_percent numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create product_batches table
CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  expiry_date date,
  purchase_cost numeric(10,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  received_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create product_suppliers table
CREATE TABLE IF NOT EXISTS product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku text,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  lead_time_days integer DEFAULT 7,
  minimum_order_qty integer DEFAULT 1,
  is_preferred boolean DEFAULT false,
  last_purchase_date date,
  last_purchase_price numeric(10,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, supplier_id)
);

-- Create product_warehouse_locations table
CREATE TABLE IF NOT EXISTS product_warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  warehouse_name text NOT NULL,
  rack_location text,
  bin_location text,
  storage_type text DEFAULT 'ambient' CHECK (storage_type IN ('ambient', 'refrigerated', 'frozen')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create product_marketing_tags table
CREATE TABLE IF NOT EXISTS product_marketing_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  is_best_seller boolean DEFAULT false,
  is_trending boolean DEFAULT false,
  is_new_arrival boolean DEFAULT false,
  is_deal boolean DEFAULT false,
  homepage_section text,
  bundle_eligible boolean DEFAULT true,
  push_priority_score integer DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, store_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_bundles_bundle ON product_bundles(bundle_product_id);
CREATE INDEX IF NOT EXISTS idx_product_bundles_component ON product_bundles(component_product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product ON product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_preferred ON product_suppliers(is_preferred) WHERE is_preferred = true;
CREATE INDEX IF NOT EXISTS idx_product_warehouse_product ON product_warehouse_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_marketing_product ON product_marketing_tags(product_id);
CREATE INDEX IF NOT EXISTS idx_product_marketing_priority ON product_marketing_tags(push_priority_score DESC);

-- Enable RLS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_marketing_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view product variants"
  ON product_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage product variants"
  ON product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view product bundles"
  ON product_bundles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage product bundles"
  ON product_bundles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view product batches"
  ON product_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage product batches"
  ON product_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view product suppliers"
  ON product_suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage product suppliers"
  ON product_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view warehouse locations"
  ON product_warehouse_locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage warehouse locations"
  ON product_warehouse_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can view marketing tags"
  ON product_marketing_tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage marketing tags"
  ON product_marketing_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update triggers
CREATE OR REPLACE FUNCTION update_product_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_variants_updated_at ON product_variants;
CREATE TRIGGER trigger_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_product_batches_updated_at ON product_batches;
CREATE TRIGGER trigger_product_batches_updated_at
  BEFORE UPDATE ON product_batches
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_product_suppliers_updated_at ON product_suppliers;
CREATE TRIGGER trigger_product_suppliers_updated_at
  BEFORE UPDATE ON product_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_product_warehouse_updated_at ON product_warehouse_locations;
CREATE TRIGGER trigger_product_warehouse_updated_at
  BEFORE UPDATE ON product_warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_product_marketing_updated_at ON product_marketing_tags;
CREATE TRIGGER trigger_product_marketing_updated_at
  BEFORE UPDATE ON product_marketing_tags
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

COMMENT ON TABLE product_variants IS 'Variable product configurations';
COMMENT ON TABLE product_bundles IS 'Bundle/combo product compositions';
COMMENT ON TABLE product_batches IS 'Inventory batch tracking with expiry dates';
COMMENT ON TABLE product_suppliers IS 'Multiple supplier relationships per product';
COMMENT ON TABLE product_warehouse_locations IS 'Physical warehouse location tracking';
COMMENT ON TABLE product_marketing_tags IS 'Marketing flags and visibility settings';
