/*
  # Advanced Packing + Profit Intelligence System

  Adds dimension-based box recommendations, profit calculations, and supplier optimization.

  ## Schema Updates

  ### 1. products table additions
  - `length_cm` (decimal) - Product length in centimeters
  - `width_cm` (decimal) - Product width in centimeters
  - `height_cm` (decimal) - Product height in centimeters
  - `weight_kg` (decimal) - Product weight in kilograms

  ### 2. packing_materials table additions (for boxes)
  - `internal_length` (decimal) - Internal box length in cm
  - `internal_width` (decimal) - Internal box width in cm
  - `internal_height` (decimal) - Internal box height in cm
  - `max_weight` (decimal) - Maximum weight capacity in kg
  - `volume_cm3` (decimal) - Internal volume in cubic cm

  ### 3. orders table profit fields
  - `product_cost_total` (decimal) - Total cost of products
  - `platform_fee` (decimal) - Optional platform/marketplace fee
  - `total_revenue` (decimal) - Total order revenue
  - `gross_profit` (decimal) - Calculated profit
  - `profit_margin` (decimal) - Profit margin percentage
  - `cost_per_kg` (decimal) - Cost efficiency metric

  ### 4. New table: supplier_material_prices
  Track multiple supplier prices for materials
  - `id` (uuid, primary key)
  - `material_id` (uuid, FK to packing_materials)
  - `supplier_name` (text)
  - `cost_per_unit` (decimal)
  - `minimum_order_quantity` (integer)
  - `lead_time_days` (integer)
  - `is_preferred` (boolean)
  - `last_updated` (timestamptz)
  - `created_at` (timestamptz)

  ### 5. New table: packing_learning_data
  Track packing decisions for AI learning
  - `id` (uuid, primary key)
  - `order_id` (uuid, FK to orders)
  - `suggested_box_id` (uuid)
  - `actual_box_id` (uuid)
  - `fit_score` (text) - tight, perfect, loose
  - `was_suggestion_used` (boolean)
  - `total_volume_cm3` (decimal)
  - `total_weight_kg` (decimal)
  - `packing_time_seconds` (integer)
  - `created_at` (timestamptz)

  ### 6. order_packing table additions
  - `box_fit_score` (text) - tight, perfect, loose, oversized
  - `volume_utilization` (decimal) - Percentage of box volume used
  - `weight_utilization` (decimal) - Percentage of max weight used
  - `suggested_box_id` (uuid) - AI suggested box
  - `manual_override` (boolean) - If user overrode suggestion

  ## Security
  - Enable RLS on all new tables
  - Authenticated users can read/write all data
  - Performance indexes on frequently queried columns
*/

-- Add dimension fields to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'length_cm'
  ) THEN
    ALTER TABLE products ADD COLUMN length_cm decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'width_cm'
  ) THEN
    ALTER TABLE products ADD COLUMN width_cm decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'height_cm'
  ) THEN
    ALTER TABLE products ADD COLUMN height_cm decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'weight_kg'
  ) THEN
    ALTER TABLE products ADD COLUMN weight_kg decimal(10, 3);
  END IF;
END $$;

-- Add dimension fields to packing_materials table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packing_materials' AND column_name = 'internal_length'
  ) THEN
    ALTER TABLE packing_materials ADD COLUMN internal_length decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packing_materials' AND column_name = 'internal_width'
  ) THEN
    ALTER TABLE packing_materials ADD COLUMN internal_width decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packing_materials' AND column_name = 'internal_height'
  ) THEN
    ALTER TABLE packing_materials ADD COLUMN internal_height decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packing_materials' AND column_name = 'max_weight'
  ) THEN
    ALTER TABLE packing_materials ADD COLUMN max_weight decimal(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packing_materials' AND column_name = 'volume_cm3'
  ) THEN
    ALTER TABLE packing_materials ADD COLUMN volume_cm3 decimal(15, 2);
  END IF;
END $$;

-- Add profit calculation fields to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'product_cost_total'
  ) THEN
    ALTER TABLE orders ADD COLUMN product_cost_total decimal(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'platform_fee'
  ) THEN
    ALTER TABLE orders ADD COLUMN platform_fee decimal(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'total_revenue'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_revenue decimal(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'gross_profit'
  ) THEN
    ALTER TABLE orders ADD COLUMN gross_profit decimal(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'profit_margin'
  ) THEN
    ALTER TABLE orders ADD COLUMN profit_margin decimal(5, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'cost_per_kg'
  ) THEN
    ALTER TABLE orders ADD COLUMN cost_per_kg decimal(10, 2);
  END IF;
END $$;

-- Add enhanced fields to order_packing table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_packing' AND column_name = 'box_fit_score'
  ) THEN
    ALTER TABLE order_packing ADD COLUMN box_fit_score text CHECK (box_fit_score IN ('tight', 'perfect', 'loose', 'oversized'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_packing' AND column_name = 'volume_utilization'
  ) THEN
    ALTER TABLE order_packing ADD COLUMN volume_utilization decimal(5, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_packing' AND column_name = 'weight_utilization'
  ) THEN
    ALTER TABLE order_packing ADD COLUMN weight_utilization decimal(5, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_packing' AND column_name = 'suggested_box_id'
  ) THEN
    ALTER TABLE order_packing ADD COLUMN suggested_box_id uuid REFERENCES packing_materials(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_packing' AND column_name = 'manual_override'
  ) THEN
    ALTER TABLE order_packing ADD COLUMN manual_override boolean DEFAULT false;
  END IF;
END $$;

-- Create supplier_material_prices table
CREATE TABLE IF NOT EXISTS supplier_material_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES packing_materials(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  cost_per_unit decimal(10, 2) NOT NULL,
  minimum_order_quantity integer DEFAULT 1,
  lead_time_days integer DEFAULT 0,
  is_preferred boolean DEFAULT false,
  notes text,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create packing_learning_data table
CREATE TABLE IF NOT EXISTS packing_learning_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  suggested_box_id uuid REFERENCES packing_materials(id),
  actual_box_id uuid REFERENCES packing_materials(id),
  fit_score text CHECK (fit_score IN ('tight', 'perfect', 'loose', 'oversized')),
  was_suggestion_used boolean DEFAULT false,
  total_volume_cm3 decimal(15, 2),
  total_weight_kg decimal(10, 3),
  packing_time_seconds integer,
  feedback text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_supplier_prices_material ON supplier_material_prices(material_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier ON supplier_material_prices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_preferred ON supplier_material_prices(is_preferred);
CREATE INDEX IF NOT EXISTS idx_packing_learning_order ON packing_learning_data(order_id);
CREATE INDEX IF NOT EXISTS idx_packing_learning_suggested ON packing_learning_data(suggested_box_id);
CREATE INDEX IF NOT EXISTS idx_packing_learning_actual ON packing_learning_data(actual_box_id);
CREATE INDEX IF NOT EXISTS idx_order_packing_suggested_box ON order_packing(suggested_box_id);
CREATE INDEX IF NOT EXISTS idx_products_dimensions ON products(length_cm, width_cm, height_cm, weight_kg);
CREATE INDEX IF NOT EXISTS idx_materials_dimensions ON packing_materials(internal_length, internal_width, internal_height);

-- Enable RLS on new tables
ALTER TABLE supplier_material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_learning_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supplier_material_prices
CREATE POLICY "Authenticated users can view supplier prices"
  ON supplier_material_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create supplier prices"
  ON supplier_material_prices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update supplier prices"
  ON supplier_material_prices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete supplier prices"
  ON supplier_material_prices FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for packing_learning_data
CREATE POLICY "Authenticated users can view learning data"
  ON packing_learning_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create learning data"
  ON packing_learning_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to calculate box volume automatically
CREATE OR REPLACE FUNCTION calculate_box_volume()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_length IS NOT NULL 
     AND NEW.internal_width IS NOT NULL 
     AND NEW.internal_height IS NOT NULL 
     AND NEW.category = 'box' THEN
    NEW.volume_cm3 := NEW.internal_length * NEW.internal_width * NEW.internal_height;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate box volume
DROP TRIGGER IF EXISTS trigger_calculate_box_volume ON packing_materials;
CREATE TRIGGER trigger_calculate_box_volume
  BEFORE INSERT OR UPDATE ON packing_materials
  FOR EACH ROW
  EXECUTE FUNCTION calculate_box_volume();

-- Function to calculate order profit
CREATE OR REPLACE FUNCTION calculate_order_profit()
RETURNS TRIGGER AS $$
DECLARE
  total_cost decimal(10, 2);
  total_weight decimal(10, 3);
BEGIN
  -- Calculate total cost
  total_cost := COALESCE(NEW.product_cost_total, 0) 
                + COALESCE(NEW.packing_cost, 0) 
                + COALESCE(NEW.delivery_fee, 0)
                + COALESCE(NEW.platform_fee, 0);
  
  -- Calculate profit
  NEW.total_revenue := NEW.total;
  NEW.gross_profit := NEW.total_revenue - total_cost;
  
  -- Calculate profit margin
  IF NEW.total_revenue > 0 THEN
    NEW.profit_margin := (NEW.gross_profit / NEW.total_revenue) * 100;
  ELSE
    NEW.profit_margin := 0;
  END IF;
  
  -- Calculate cost per kg (if weight data available)
  SELECT SUM(oi.quantity * COALESCE(p.weight_kg, 0))
  INTO total_weight
  FROM order_items oi
  LEFT JOIN products p ON oi.product_id = p.id
  WHERE oi.order_id = NEW.id;
  
  IF total_weight > 0 THEN
    NEW.cost_per_kg := total_cost / total_weight;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate profit
DROP TRIGGER IF EXISTS trigger_calculate_order_profit ON orders;
CREATE TRIGGER trigger_calculate_order_profit
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_order_profit();

-- Function to update last_updated on supplier prices
CREATE OR REPLACE FUNCTION update_supplier_price_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp
DROP TRIGGER IF EXISTS trigger_update_supplier_price_timestamp ON supplier_material_prices;
CREATE TRIGGER trigger_update_supplier_price_timestamp
  BEFORE UPDATE ON supplier_material_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_price_timestamp();
