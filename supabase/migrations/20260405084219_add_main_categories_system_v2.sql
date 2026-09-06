/*
  # Add Main Categories System

  1. New Tables
    - `main_categories`
      - `id` (uuid, primary key)
      - `name` (text) - e.g., "Dry Foods", "Frozen Foods"
      - `slug` (text, unique)
      - `description` (text, optional)
      - `sort_order` (integer) - for display ordering
      - `is_active` (boolean) - default true
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes
    - Add `main_category_id` to `products` table
    - Foreign key relationship to main_categories
  
  3. Security
    - Enable RLS on `main_categories` table
    - Add policies for authenticated users
  
  4. Notes
    - Main categories are for CentralHub organization only
    - Not applicable to individual stores
    - Examples: Dry Foods, Frozen Foods, Fresh Produce, Beverages
*/

-- Create main_categories table
CREATE TABLE IF NOT EXISTS main_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add main_category_id to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'main_category_id'
  ) THEN
    ALTER TABLE products ADD COLUMN main_category_id uuid REFERENCES main_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE main_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for main_categories (simple authenticated access)
CREATE POLICY "Authenticated users can view main categories"
  ON main_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert main categories"
  ON main_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update main categories"
  ON main_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete main categories"
  ON main_categories FOR DELETE
  TO authenticated
  USING (true);

-- Insert default main categories
INSERT INTO main_categories (name, slug, sort_order) VALUES
  ('Dry Foods', 'dry-foods', 1),
  ('Frozen Foods', 'frozen-foods', 2),
  ('Fresh Produce', 'fresh-produce', 3),
  ('Beverages', 'beverages', 4),
  ('Dairy', 'dairy', 5),
  ('Bakery', 'bakery', 6),
  ('Meat & Seafood', 'meat-seafood', 7),
  ('Snacks', 'snacks', 8),
  ('Condiments & Sauces', 'condiments-sauces', 9),
  ('Household', 'household', 10)
ON CONFLICT (name) DO NOTHING;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_products_main_category_id ON products(main_category_id);
CREATE INDEX IF NOT EXISTS idx_main_categories_is_active ON main_categories(is_active) WHERE is_active = true;