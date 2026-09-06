/*
  # Add Dynamic Pricing Rules System

  ## Overview
  This migration creates a pricing rules engine that allows automated price adjustments
  based on configurable rules. Rules can target specific stores, categories, or products
  and are applied in priority order after store overrides.

  ## New Tables
  
  ### pricing_rules
  Core pricing rules configuration table
  - id (uuid, primary key) - Unique rule identifier
  - name (text) - Human-readable rule name
  - store_id (uuid, nullable) - Target store (null = applies to all stores)
  - category_id (uuid, nullable) - Target category (null = not category-specific)
  - product_id (uuid, nullable) - Target product (null = not product-specific)
  - type (enum: percentage, fixed) - Rule type (percentage adjustment or fixed amount)
  - value (numeric) - Rule value (e.g., 10 for 10%, or 2.00 for £2)
  - priority (integer) - Rule priority (higher number = applied first)
  - is_active (boolean) - Enable/disable rule without deletion
  - created_at (timestamptz) - Creation timestamp
  - updated_at (timestamptz) - Last modification timestamp

  ## Rule Application Logic
  
  1. Start with base_price from products table
  2. Apply store_products.price_override if exists
  3. Fetch all active rules matching store/category/product
  4. Sort by priority DESC
  5. Apply rules sequentially (percentage rules multiply, fixed rules add/subtract)
  6. Result is final_price
  
  ## Security
  
  - Enable RLS on pricing_rules table
  - Only authenticated users can read rules
  
  ## Indexes
  
  - Composite index on (store_id, category_id, product_id, is_active) for fast lookups
  - Index on priority for sorting
*/

-- Create pricing rule type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_rule_type') THEN
    CREATE TYPE pricing_rule_type AS ENUM ('percentage', 'fixed');
  END IF;
END $$;

-- Create pricing_rules table
CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  type pricing_rule_type NOT NULL,
  value numeric NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_target CHECK (
    store_id IS NOT NULL OR 
    category_id IS NOT NULL OR 
    product_id IS NOT NULL
  )
);

-- Create indexes for fast rule lookups
CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup 
  ON pricing_rules(store_id, category_id, product_id, is_active);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_priority 
  ON pricing_rules(priority DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_store 
  ON pricing_rules(store_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_category 
  ON pricing_rules(category_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_product 
  ON pricing_rules(product_id) WHERE is_active = true;

-- Enable RLS
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read pricing rules
CREATE POLICY "Anyone can view pricing rules"
  ON pricing_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to manage pricing rules (for admin dashboard)
CREATE POLICY "Authenticated users can insert pricing rules"
  ON pricing_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pricing rules"
  ON pricing_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pricing rules"
  ON pricing_rules
  FOR DELETE
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_pricing_rules_timestamp'
  ) THEN
    CREATE TRIGGER update_pricing_rules_timestamp
      BEFORE UPDATE ON pricing_rules
      FOR EACH ROW
      EXECUTE FUNCTION update_pricing_rules_updated_at();
  END IF;
END $$;
