/*
  # Add Store Products Override Layer for CentralHub

  ## Overview
  Adds the store override layer to enable multi-store product management.
  Works with existing products table as the master source.

  ## Changes

  ### 1. Update stores table
  - Add `slug` column if it doesn't exist
  
  ### 2. Create store_products table (NEW)
  Override layer for per-store product customization
  - `id` (uuid, primary key)
  - `product_id` (uuid, foreign key to products)
  - `store_id` (uuid, foreign key to stores)
  - `name_override` (text, nullable) - Override product name
  - `description_override` (text, nullable) - Override description
  - `price_override` (decimal, nullable) - Override price
  - `image_override` (text, nullable) - Override image URL
  - `is_active` (boolean, default true) - Product visibility per store
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - UNIQUE constraint on (product_id, store_id)

  ## Business Logic
  Product resolution for a specific store:
  - final_name = name_override ?? product.name
  - final_price = price_override ?? product.price
  - final_description = description_override ?? product.description
  - final_image = image_override ?? product.image_url

  ## Security
  - RLS enabled with public read, authenticated write policies
*/

-- Add slug column to stores if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'slug'
  ) THEN
    ALTER TABLE stores ADD COLUMN slug text UNIQUE;
  END IF;
END $$;

-- Create store_products table (override layer)
CREATE TABLE IF NOT EXISTS store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name_override text,
  description_override text,
  price_override decimal(10,2),
  image_override text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, store_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_store_products_product_id ON store_products(product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_store_id ON store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_is_active ON store_products(is_active);

-- Enable Row Level Security
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for store_products
CREATE POLICY "Allow public read access to store_products"
  ON store_products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated insert to store_products"
  ON store_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to store_products"
  ON store_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete to store_products"
  ON store_products FOR DELETE
  TO authenticated
  USING (true);