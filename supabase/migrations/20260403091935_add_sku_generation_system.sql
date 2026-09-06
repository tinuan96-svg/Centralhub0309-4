/*
  # Add SKU Generation System

  ## Overview
  Adds automatic SKU generation for products based on store association.

  ## Changes

  ### 1. Add columns to products table
  - `sku` (TEXT, UNIQUE) - Auto-generated SKU code
  - `store_id` (UUID, references stores) - Store that owns the product

  ### 2. Create SKU generation function
  Function to generate unique SKU based on store:
  - KeralaGroceries → KGS1000, KGS1001, KGS1002...
  - PocketGrocery → PGS1000, PGS1001, PGS1002...
  
  Logic:
  1. Get store slug to determine prefix
  2. Find last SKU with same prefix
  3. Extract number and increment
  4. Start from 1000 if no previous SKU exists

  ### 3. Create trigger
  Auto-generate SKU on product insert if not provided

  ## Business Logic
  - Each product gets a unique SKU
  - SKU format: [PREFIX][NUMBER]
  - Prefix based on store (KGS for KeralaGroceries, PGS for PocketGrocery)
  - Numbers start at 1000 and increment sequentially
  - Existing products without SKU can be updated later

  ## Security
  - No RLS changes needed (inherits from products table)
*/

-- Add sku column to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'sku'
  ) THEN
    ALTER TABLE products ADD COLUMN sku TEXT UNIQUE;
  END IF;
END $$;

-- Add store_id column to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE products ADD COLUMN store_id UUID REFERENCES stores(id);
  END IF;
END $$;

-- Create index on store_id for better performance
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- Function to generate SKU based on store
CREATE OR REPLACE FUNCTION generate_sku(p_store_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_last_sku TEXT;
  v_last_number INTEGER;
  v_new_number INTEGER;
  v_new_sku TEXT;
  v_store_name TEXT;
BEGIN
  -- Get store name to determine prefix
  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_store_id;

  -- Determine prefix based on store
  IF v_store_name = 'KeralaGroceries' THEN
    v_prefix := 'KGS';
  ELSIF v_store_name = 'PocketGrocery' THEN
    v_prefix := 'PGS';
  ELSE
    -- Default prefix for any other store
    v_prefix := 'GEN';
  END IF;

  -- Find the last SKU with this prefix
  SELECT sku INTO v_last_sku
  FROM products
  WHERE sku LIKE v_prefix || '%'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Extract number and increment
  IF v_last_sku IS NULL THEN
    -- No previous SKU, start from 1000
    v_new_number := 1000;
  ELSE
    -- Extract number from last SKU (remove prefix)
    v_last_number := SUBSTRING(v_last_sku FROM LENGTH(v_prefix) + 1)::INTEGER;
    v_new_number := v_last_number + 1;
  END IF;

  -- Generate new SKU
  v_new_sku := v_prefix || v_new_number;

  RETURN v_new_sku;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-generate SKU
CREATE OR REPLACE FUNCTION auto_generate_sku()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate SKU if not provided and store_id exists
  IF NEW.sku IS NULL AND NEW.store_id IS NOT NULL THEN
    NEW.sku := generate_sku(NEW.store_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on products table
DROP TRIGGER IF EXISTS trigger_auto_generate_sku ON products;
CREATE TRIGGER trigger_auto_generate_sku
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_sku();

-- Update existing products to assign to KeralaGroceries by default
-- (This can be adjusted based on business requirements)
UPDATE products
SET store_id = (SELECT id FROM stores WHERE name = 'KeralaGroceries' LIMIT 1)
WHERE store_id IS NULL;