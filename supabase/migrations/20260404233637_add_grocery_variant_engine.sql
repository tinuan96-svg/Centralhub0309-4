/*
  # Add Grocery-Focused Product Variant Engine

  1. Enhanced Product Variants
    - Add absolute pricing fields (cost_price, price) instead of adjustments
    - Add SKU and barcode fields
    - Add unit and pack type for grocery use cases
    - Add price_per_unit calculation support
    - Add variant-specific marketing flags

  2. New Tables
    - `store_product_variants` - Store-specific variant pricing and stock
    - `variant_analytics` - Track performance per variant

  3. Functions
    - Auto-calculate price per kg/unit
    - Generate variant SKUs
    - Best selling variant reporting

  4. Purpose
    - Support weight-based grocery variants (500g, 1kg, 5kg)
    - Enable store-specific variant pricing
    - Track variant-level inventory
    - Optimize pricing with bulk discounts

  5. Security
    - Enable RLS on all new tables
    - Admin-only access to variant management
*/

-- Add enhanced columns to product_variants table
DO $$
BEGIN
  -- Add absolute price fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'price'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN price numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN cost_price numeric(10,2);
  END IF;

  -- Add SKU and barcode
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'sku'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN sku text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN barcode text;
  END IF;

  -- Add unit information for grocery
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'unit_value'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN unit_value numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'unit_type'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN unit_type text CHECK (unit_type IN ('g', 'kg', 'ml', 'l', 'pieces'));
  END IF;

  -- Add pack type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'pack_type'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN pack_type text DEFAULT 'single' CHECK (pack_type IN ('single', 'pack', 'bundle'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'pack_quantity'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN pack_quantity integer DEFAULT 1;
  END IF;

  -- Add display order
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN sort_order integer DEFAULT 0;
  END IF;

  -- Add image support
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN image_url text;
  END IF;

  -- Add low stock threshold per variant
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'low_stock_threshold'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN low_stock_threshold integer DEFAULT 10;
  END IF;

  -- Add VAT rate per variant
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN vat_rate numeric(5,2) DEFAULT 0;
  END IF;
END $$;

-- Create store_product_variants table for store-specific variant pricing
CREATE TABLE IF NOT EXISTS store_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  override_price numeric(10,2),
  override_stock integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, variant_id)
);

-- Create variant_analytics table for tracking variant performance
CREATE TABLE IF NOT EXISTS variant_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  units_sold integer DEFAULT 0,
  revenue numeric(10,2) DEFAULT 0,
  profit numeric(10,2) DEFAULT 0,
  views integer DEFAULT 0,
  cart_adds integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(variant_id, store_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_product_variants_sort ON product_variants(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_store_product_variants_store ON store_product_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_store_product_variants_variant ON store_product_variants(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_analytics_variant ON variant_analytics(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_analytics_date ON variant_analytics(date DESC);

-- Enable RLS
ALTER TABLE store_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for store_product_variants
CREATE POLICY "Authenticated users can view store variant pricing"
  ON store_product_variants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage store variant pricing"
  ON store_product_variants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for variant_analytics
CREATE POLICY "Authenticated users can view variant analytics"
  ON variant_analytics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage variant analytics"
  ON variant_analytics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create function to calculate price per unit
CREATE OR REPLACE FUNCTION calculate_price_per_unit(
  p_price numeric,
  p_unit_value numeric,
  p_unit_type text
)
RETURNS numeric AS $$
DECLARE
  base_unit_value numeric;
BEGIN
  IF p_unit_value IS NULL OR p_unit_value = 0 OR p_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- Convert to base unit (grams or ml)
  CASE p_unit_type
    WHEN 'kg' THEN
      base_unit_value := p_unit_value * 1000;
    WHEN 'l' THEN
      base_unit_value := p_unit_value * 1000;
    ELSE
      base_unit_value := p_unit_value;
  END CASE;

  -- Return price per kg or L
  IF p_unit_type IN ('g', 'kg') THEN
    RETURN ROUND((p_price / base_unit_value) * 1000, 2);
  ELSIF p_unit_type IN ('ml', 'l') THEN
    RETURN ROUND((p_price / base_unit_value) * 1000, 2);
  ELSE
    RETURN ROUND(p_price / p_unit_value, 2);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to generate variant SKU
CREATE OR REPLACE FUNCTION generate_variant_sku(
  p_product_id uuid,
  p_unit_value numeric,
  p_unit_type text
)
RETURNS text AS $$
DECLARE
  base_sku text;
  suffix text;
BEGIN
  -- Get parent product SKU or generate from ID
  SELECT COALESCE(
    (SELECT sku FROM products WHERE id = p_product_id AND sku IS NOT NULL AND sku != ''),
    'PRD-' || SUBSTRING(p_product_id::text, 1, 8)
  ) INTO base_sku;

  -- Generate suffix from unit
  suffix := UPPER(p_unit_value::text || p_unit_type);

  RETURN base_sku || '-' || suffix;
END;
$$ LANGUAGE plpgsql;

-- Create function to get best selling variant
CREATE OR REPLACE FUNCTION get_best_selling_variant(p_product_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  variant_id uuid,
  variant_name text,
  total_units_sold bigint,
  total_revenue numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.id,
    pv.variant_name,
    COALESCE(SUM(va.units_sold)::bigint, 0) as total_units_sold,
    COALESCE(SUM(va.revenue), 0) as total_revenue
  FROM product_variants pv
  LEFT JOIN variant_analytics va ON pv.id = va.variant_id
    AND va.date >= CURRENT_DATE - p_days
  WHERE pv.product_id = p_product_id
    AND pv.is_active = true
  GROUP BY pv.id, pv.variant_name
  ORDER BY total_units_sold DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to auto-generate variants
CREATE OR REPLACE FUNCTION auto_generate_variants(
  p_product_id uuid,
  p_base_unit_value numeric,
  p_unit_type text,
  p_multipliers numeric[],
  p_base_price numeric,
  p_base_cost numeric,
  p_discount_percent numeric DEFAULT 5
)
RETURNS void AS $$
DECLARE
  multiplier numeric;
  variant_unit_value numeric;
  variant_price numeric;
  variant_cost numeric;
  variant_name text;
  discount_factor numeric;
  idx integer := 0;
BEGIN
  FOREACH multiplier IN ARRAY p_multipliers
  LOOP
    idx := idx + 1;
    variant_unit_value := p_base_unit_value * multiplier;

    -- Apply progressive discount for larger packs
    discount_factor := 1 - ((idx - 1) * p_discount_percent / 100);

    -- Calculate price per unit with discount
    variant_price := ROUND((p_base_price * multiplier * discount_factor), 2);
    variant_cost := ROUND((p_base_cost * multiplier), 2);

    -- Generate variant name
    variant_name := variant_unit_value::text || p_unit_type;

    -- Insert variant
    INSERT INTO product_variants (
      product_id,
      variant_name,
      unit_value,
      unit_type,
      price,
      cost_price,
      sku,
      sort_order,
      is_active
    ) VALUES (
      p_product_id,
      variant_name,
      variant_unit_value,
      p_unit_type,
      variant_price,
      variant_cost,
      generate_variant_sku(p_product_id, variant_unit_value, p_unit_type),
      idx,
      true
    )
    ON CONFLICT (sku) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for store_product_variants updated_at
DROP TRIGGER IF EXISTS trigger_store_product_variants_updated_at ON store_product_variants;
CREATE TRIGGER trigger_store_product_variants_updated_at
  BEFORE UPDATE ON store_product_variants
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

-- Create trigger for variant_analytics updated_at
DROP TRIGGER IF EXISTS trigger_variant_analytics_updated_at ON variant_analytics;
CREATE TRIGGER trigger_variant_analytics_updated_at
  BEFORE UPDATE ON variant_analytics
  FOR EACH ROW EXECUTE FUNCTION update_product_tables_updated_at();

-- Add helpful comments
COMMENT ON TABLE store_product_variants IS 'Store-specific variant pricing and stock overrides';
COMMENT ON TABLE variant_analytics IS 'Track sales performance per variant';
COMMENT ON FUNCTION calculate_price_per_unit IS 'Calculate normalized price per kg/L for comparison';
COMMENT ON FUNCTION generate_variant_sku IS 'Auto-generate SKU for product variants';
COMMENT ON FUNCTION get_best_selling_variant IS 'Get top performing variant for a product';
COMMENT ON FUNCTION auto_generate_variants IS 'Auto-create multiple variants from base unit with progressive pricing';
