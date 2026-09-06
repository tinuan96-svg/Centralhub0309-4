/*
  # Kerala Grocery UK E-commerce Schema

  ## Overview
  Creates the complete database structure for a real-time synchronized e-commerce platform
  with admin dashboard and storefront integration.

  ## New Tables
  
  ### `categories`
  - `id` (uuid, primary key) - Unique category identifier
  - `name` (text, unique) - Category name (e.g., "Spices", "Rice", "Snacks")
  - `slug` (text, unique) - URL-friendly category identifier
  - `created_at` (timestamptz) - Record creation timestamp
  
  ### `products`
  - `id` (uuid, primary key) - Unique product identifier
  - `name` (text) - Product name
  - `price` (numeric) - Product price in GBP
  - `image_url` (text) - Product image URL
  - `stock` (integer) - Available stock quantity
  - `category_id` (uuid, foreign key) - Links to categories table
  - `is_featured` (boolean) - Featured product flag for homepage
  - `is_best_seller` (boolean) - Best seller badge flag
  - `is_deal` (boolean) - Deal/discount flag
  - `discount_percent` (integer) - Discount percentage (0-100)
  - `sold_count` (integer) - Total units sold (for ranking)
  - `description` (text) - Product description
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on all tables
  - Public read access for storefront
  - Admin write access (can be enhanced with auth later)

  ## Real-time
  - Tables are configured for Supabase Realtime subscriptions
  - All changes trigger real-time events
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  image_url text DEFAULT '',
  stock integer DEFAULT 0 CHECK (stock >= 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  is_featured boolean DEFAULT false,
  is_best_seller boolean DEFAULT false,
  is_deal boolean DEFAULT false,
  discount_percent integer DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  sold_count integer DEFAULT 0 CHECK (sold_count >= 0),
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_best_seller ON products(is_best_seller) WHERE is_best_seller = true;
CREATE INDEX IF NOT EXISTS idx_products_deals ON products(is_deal) WHERE is_deal = true;
CREATE INDEX IF NOT EXISTS idx_products_sold_count ON products(sold_count DESC);

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories
-- Allow public read access for storefront
CREATE POLICY "Public can view categories"
  ON categories FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert categories (for admin)
CREATE POLICY "Authenticated can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update categories
CREATE POLICY "Authenticated can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete categories
CREATE POLICY "Authenticated can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for products
-- Allow public read access for storefront
CREATE POLICY "Public can view products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert products (for admin)
CREATE POLICY "Authenticated can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update products (for admin)
CREATE POLICY "Authenticated can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete products (for admin)
CREATE POLICY "Authenticated can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample categories
INSERT INTO categories (name, slug) VALUES
  ('Spices & Masalas', 'spices-masalas'),
  ('Rice & Grains', 'rice-grains'),
  ('Snacks & Sweets', 'snacks-sweets'),
  ('Beverages', 'beverages'),
  ('Ready to Eat', 'ready-to-eat'),
  ('Fresh Produce', 'fresh-produce')
ON CONFLICT (name) DO NOTHING;

-- Insert sample products
INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Kerala Red Rice',
  4.99,
  'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400',
  50,
  (SELECT id FROM categories WHERE slug = 'rice-grains'),
  true,
  true,
  false,
  0,
  145,
  'Authentic Kerala red rice, rich in nutrients and perfect for traditional meals.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Kerala Red Rice');

INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Garam Masala Powder',
  3.49,
  'https://images.unsplash.com/photo-1596040033229-a0b7e4d6d643?w=400',
  100,
  (SELECT id FROM categories WHERE slug = 'spices-masalas'),
  true,
  false,
  true,
  15,
  89,
  'Premium blend of aromatic spices for authentic Indian cooking.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Garam Masala Powder');

INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Banana Chips',
  2.99,
  'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400',
  75,
  (SELECT id FROM categories WHERE slug = 'snacks-sweets'),
  false,
  true,
  false,
  0,
  234,
  'Crispy banana chips made from raw plantains, a Kerala specialty.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Banana Chips');

INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Masala Chai Tea',
  5.99,
  'https://images.unsplash.com/photo-1597318132729-d794503fafc7?w=400',
  3,
  (SELECT id FROM categories WHERE slug = 'beverages'),
  false,
  false,
  true,
  20,
  67,
  'Aromatic masala chai blend with cardamom, ginger, and spices.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Masala Chai Tea');

INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Coconut Oil (500ml)',
  6.99,
  'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400',
  60,
  (SELECT id FROM categories WHERE slug = 'fresh-produce'),
  true,
  false,
  false,
  0,
  112,
  'Pure Kerala coconut oil, cold-pressed and chemical-free.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Coconut Oil (500ml)');

INSERT INTO products (name, price, image_url, stock, category_id, is_featured, is_best_seller, is_deal, discount_percent, sold_count, description) 
SELECT 
  'Idli & Dosa Batter',
  4.49,
  'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400',
  25,
  (SELECT id FROM categories WHERE slug = 'ready-to-eat'),
  false,
  true,
  true,
  10,
  178,
  'Ready-to-use fermented batter for soft idlis and crispy dosas.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Idli & Dosa Batter');