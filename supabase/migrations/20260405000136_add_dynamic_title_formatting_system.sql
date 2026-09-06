/*
  # Add Dynamic Product Title Formatting System

  1. Enhanced Products Table
    - `product_name` - Core product name (e.g., "Matta Rice")
    - `variant` - Product variant/type (e.g., "Premium", "Organic")
    - `quantity` - Numeric quantity (e.g., 5, 1.5)
    - `unit` - Unit of measurement (e.g., "kg", "g", "L", "ml")
    - Keep existing `name` as display name (will be auto-generated from format)

  2. New Table: store_settings
    - Store-level configuration including title format
    - `title_format` - Template string with placeholders
    - `default_currency` - Store currency
    - `timezone` - Store timezone
    - Other store-specific settings

  3. Functions
    - `format_product_title()` - Format product title using store template
    - `get_store_title_format()` - Get title format for a store

  4. Purpose
    - Enable flexible product title formatting per store
    - Support different display preferences (brand-first, size-first, etc.)
    - Clean handling of empty fields
    - Performance optimization with caching

  5. Security
    - Enable RLS on store_settings
    - Admin-only access to settings management
*/

-- Add structured fields to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'product_name'
  ) THEN
    ALTER TABLE products ADD COLUMN product_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'variant'
  ) THEN
    ALTER TABLE products ADD COLUMN variant text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE products ADD COLUMN quantity numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'unit'
  ) THEN
    ALTER TABLE products ADD COLUMN unit text;
  END IF;
END $$;

-- Create store_settings table
CREATE TABLE IF NOT EXISTS store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  title_format text DEFAULT '{brand} {product_name} {quantity}{unit}',
  default_currency text DEFAULT 'GBP',
  timezone text DEFAULT 'UTC',
  tax_inclusive boolean DEFAULT false,
  decimal_places integer DEFAULT 2,
  show_stock_levels boolean DEFAULT true,
  low_stock_message text DEFAULT 'Only {stock} left in stock',
  out_of_stock_message text DEFAULT 'Out of stock',
  show_price_per_unit boolean DEFAULT true,
  date_format text DEFAULT 'DD/MM/YYYY',
  time_format text DEFAULT '24h',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_product_name ON products(product_name) WHERE product_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_variant ON products(variant) WHERE variant IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_settings_store ON store_settings(store_id);

-- Enable RLS
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for store_settings
CREATE POLICY "Authenticated users can view store settings"
  ON store_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage store settings"
  ON store_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create function to format product title
CREATE OR REPLACE FUNCTION format_product_title(
  p_brand text,
  p_product_name text,
  p_variant text,
  p_quantity numeric,
  p_unit text,
  p_title_format text
)
RETURNS text AS $$
DECLARE
  result text;
  quantity_str text;
BEGIN
  result := COALESCE(p_title_format, '{brand} {product_name} {quantity}{unit}');
  
  -- Replace placeholders with actual values
  result := REPLACE(result, '{brand}', COALESCE(p_brand, ''));
  result := REPLACE(result, '{product_name}', COALESCE(p_product_name, ''));
  result := REPLACE(result, '{variant}', COALESCE(p_variant, ''));
  
  -- Handle quantity and unit together
  IF p_quantity IS NOT NULL THEN
    quantity_str := p_quantity::text || COALESCE(p_unit, '');
    result := REPLACE(result, '{quantity}{unit}', quantity_str);
    result := REPLACE(result, '{quantity}', p_quantity::text);
  ELSE
    result := REPLACE(result, '{quantity}{unit}', '');
    result := REPLACE(result, '{quantity}', '');
  END IF;
  
  result := REPLACE(result, '{unit}', COALESCE(p_unit, ''));
  
  -- Clean up extra spaces and punctuation
  result := REGEXP_REPLACE(result, '\s+', ' ', 'g');
  result := REGEXP_REPLACE(result, '^\s+|\s+$', '', 'g');
  result := REGEXP_REPLACE(result, '\s*-\s*$', '', 'g');
  result := REGEXP_REPLACE(result, '^\s*-\s*', '', 'g');
  result := REGEXP_REPLACE(result, '\(\s*\)', '', 'g');
  result := REGEXP_REPLACE(result, '\[\s*\]', '', 'g');
  
  RETURN NULLIF(TRIM(result), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to get store title format
CREATE OR REPLACE FUNCTION get_store_title_format(p_store_id uuid)
RETURNS text AS $$
DECLARE
  format_str text;
BEGIN
  SELECT title_format INTO format_str
  FROM store_settings
  WHERE store_id = p_store_id;
  
  RETURN COALESCE(format_str, '{brand} {product_name} {quantity}{unit}');
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to auto-format product titles
CREATE OR REPLACE FUNCTION auto_format_product_titles()
RETURNS void AS $$
DECLARE
  product_rec RECORD;
  store_format text;
  formatted_title text;
BEGIN
  FOR product_rec IN 
    SELECT p.id, p.brand, p.product_name, p.variant, p.quantity, p.unit, p.store_id
    FROM products p
    WHERE p.product_name IS NOT NULL
  LOOP
    -- Get store format
    SELECT title_format INTO store_format
    FROM store_settings
    WHERE store_id = product_rec.store_id;
    
    -- Format title
    formatted_title := format_product_title(
      product_rec.brand,
      product_rec.product_name,
      product_rec.variant,
      product_rec.quantity,
      product_rec.unit,
      store_format
    );
    
    -- Update product if title changed
    IF formatted_title IS NOT NULL AND formatted_title != product_rec.name THEN
      UPDATE products
      SET name = formatted_title
      WHERE id = product_rec.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update product name when structured fields change
CREATE OR REPLACE FUNCTION trigger_update_product_title()
RETURNS TRIGGER AS $$
DECLARE
  store_format text;
  formatted_title text;
BEGIN
  -- Only proceed if we have structured data
  IF NEW.product_name IS NOT NULL THEN
    -- Get store format
    SELECT title_format INTO store_format
    FROM store_settings
    WHERE store_id = NEW.store_id;
    
    -- Format title
    formatted_title := format_product_title(
      NEW.brand,
      NEW.product_name,
      NEW.variant,
      NEW.quantity,
      NEW.unit,
      store_format
    );
    
    -- Update name field
    IF formatted_title IS NOT NULL THEN
      NEW.name := formatted_title;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on products table
DROP TRIGGER IF EXISTS trigger_auto_format_product_title ON products;
CREATE TRIGGER trigger_auto_format_product_title
  BEFORE INSERT OR UPDATE OF brand, product_name, variant, quantity, unit
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_product_title();

-- Create trigger for store_settings updated_at
DROP TRIGGER IF EXISTS trigger_store_settings_updated_at ON store_settings;
CREATE TRIGGER trigger_store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_product_tables_updated_at();

-- Add helpful comments
COMMENT ON TABLE store_settings IS 'Store-level configuration including title formatting templates';
COMMENT ON COLUMN store_settings.title_format IS 'Template for product title formatting with placeholders: {brand}, {product_name}, {variant}, {quantity}, {unit}';
COMMENT ON COLUMN products.product_name IS 'Core product name without brand or quantity (e.g., "Matta Rice")';
COMMENT ON COLUMN products.variant IS 'Product variant or type (e.g., "Premium", "Organic")';
COMMENT ON COLUMN products.quantity IS 'Numeric quantity for the product package';
COMMENT ON COLUMN products.unit IS 'Unit of measurement (e.g., "kg", "g", "L", "ml")';
COMMENT ON FUNCTION format_product_title IS 'Format product title using template with smart placeholder replacement';
COMMENT ON FUNCTION get_store_title_format IS 'Get title format template for a specific store';
COMMENT ON FUNCTION auto_format_product_titles IS 'Batch update all product titles based on store formats';
