/*
  # Create store_products table

  This table was defined in an earlier migration file but was never applied to the database.
  It provides per-store product overrides for the multi-store CentralHub system.

  ## New Table
  - `store_products` - Links products to stores with optional overrides
    - `id` (uuid, primary key)
    - `product_id` (uuid, FK to products)
    - `store_id` (uuid, FK to stores)
    - `name_override` (text, nullable)
    - `description_override` (text, nullable)
    - `price_override` (decimal, nullable)
    - `stock_override` (integer, nullable)
    - `image_override` (text, nullable)
    - `is_active` (boolean, default true)
    - UNIQUE(product_id, store_id)

  ## Security
  - RLS enabled
  - Public read, authenticated write
*/

CREATE TABLE IF NOT EXISTS store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name_override text,
  description_override text,
  price_override decimal(10,2),
  stock_override integer,
  image_override text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_products_product_id ON store_products(product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_store_id ON store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_is_active ON store_products(is_active);

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store products public read"
  ON store_products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Store products authenticated insert"
  ON store_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Store products authenticated update"
  ON store_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Store products authenticated delete"
  ON store_products FOR DELETE
  TO authenticated
  USING (true);
