/*
  # Extend VAT System with Profit & Pricing Intelligence
  
  ## CRITICAL: NON-DESTRUCTIVE EXTENSION
  This migration ONLY ADDS fields to existing tables.
  It does NOT modify or remove any existing VAT functionality.
  
  ## 1. Extend Orders Table with Profit Tracking
    Add profit calculation fields to orders:
      - `product_cost_net` - Product cost excluding VAT
      - `packing_cost_net` - Packing materials cost (net)
      - `shipping_cost_net` - Shipping cost (net)
      - `gateway_fee_net` - Payment gateway fee (net)
      - `total_cost_net` - Sum of all costs (net only)
      - `gross_profit` - Revenue minus costs (VAT excluded)
      - `profit_margin` - Profit as percentage of revenue
  
  ## 2. Extend Products Table with Pricing Intelligence
    Add auto-pricing fields:
      - `target_margin` - Target profit margin percentage
      - `min_margin` - Minimum acceptable margin
      - `avg_gateway_fee` - Average gateway fee percentage
      - `avg_packing_cost_net` - Average packing cost per unit
      - `avg_shipping_cost_net` - Average shipping cost per unit
      - `auto_price_enabled` - Enable automatic pricing
      - `price_override_lock` - Prevent auto price changes
      - `last_cost_update` - Track when costs were last updated
  
  ## 3. Create Profit Analytics Table
    Track historical profit metrics:
      - Period-based profit tracking
      - Cost breakdowns
      - Margin trends
      - Product profitability
  
  ## 4. Create Pricing Suggestions Table
    AI-powered pricing recommendations:
      - Suggested prices based on costs + margins
      - Competitive analysis data
      - Price change history
  
  ## 5. Indexes & Performance
    Add indexes for:
      - Profit queries
      - Cost analysis
      - Pricing lookups
      - Analytics aggregations
  
  ## 6. Security
    - Maintain existing RLS policies
    - No changes to VAT security
    - Add policies for new tables only
*/

-- =============================================
-- 1. EXTEND ORDERS TABLE WITH PROFIT TRACKING
-- =============================================
DO $$
BEGIN
  -- Product cost (net, excluding VAT)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'product_cost_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN product_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Packing cost (net)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'packing_cost_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN packing_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Shipping cost (net)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'shipping_cost_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN shipping_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Gateway fee (net)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'gateway_fee_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN gateway_fee_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Total cost (net, all costs combined)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total_cost_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Gross profit (revenue - costs, VAT excluded)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'gross_profit'
  ) THEN
    ALTER TABLE orders ADD COLUMN gross_profit decimal(10,2) DEFAULT 0;
  END IF;

  -- Profit margin percentage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'profit_margin'
  ) THEN
    ALTER TABLE orders ADD COLUMN profit_margin decimal(5,2) DEFAULT 0;
  END IF;
END $$;

-- Add indexes for profit queries
CREATE INDEX IF NOT EXISTS idx_orders_gross_profit ON orders(gross_profit);
CREATE INDEX IF NOT EXISTS idx_orders_profit_margin ON orders(profit_margin);
CREATE INDEX IF NOT EXISTS idx_orders_total_cost_net ON orders(total_cost_net);

-- =============================================
-- 2. EXTEND PRODUCTS TABLE WITH PRICING INTELLIGENCE
-- =============================================
DO $$
BEGIN
  -- Target profit margin
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'target_margin'
  ) THEN
    ALTER TABLE products ADD COLUMN target_margin decimal(5,2) DEFAULT 30.00;
  END IF;

  -- Minimum acceptable margin
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'min_margin'
  ) THEN
    ALTER TABLE products ADD COLUMN min_margin decimal(5,2) DEFAULT 15.00;
  END IF;

  -- Average gateway fee percentage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'avg_gateway_fee'
  ) THEN
    ALTER TABLE products ADD COLUMN avg_gateway_fee decimal(5,2) DEFAULT 2.90;
  END IF;

  -- Average packing cost per unit (net)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'avg_packing_cost_net'
  ) THEN
    ALTER TABLE products ADD COLUMN avg_packing_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Average shipping cost per unit (net)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'avg_shipping_cost_net'
  ) THEN
    ALTER TABLE products ADD COLUMN avg_shipping_cost_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Enable auto pricing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'auto_price_enabled'
  ) THEN
    ALTER TABLE products ADD COLUMN auto_price_enabled boolean DEFAULT false;
  END IF;

  -- Lock to prevent auto price changes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'price_override_lock'
  ) THEN
    ALTER TABLE products ADD COLUMN price_override_lock boolean DEFAULT false;
  END IF;

  -- Last time costs were updated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'last_cost_update'
  ) THEN
    ALTER TABLE products ADD COLUMN last_cost_update timestamptz;
  END IF;
END $$;

-- Add indexes for pricing queries
CREATE INDEX IF NOT EXISTS idx_products_target_margin ON products(target_margin);
CREATE INDEX IF NOT EXISTS idx_products_auto_price_enabled ON products(auto_price_enabled);
CREATE INDEX IF NOT EXISTS idx_products_cost_price ON products(cost_price);

-- =============================================
-- 3. CREATE PROFIT ANALYTICS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS profit_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  
  -- Revenue (all excluding VAT)
  total_revenue_net decimal(12,2) NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  avg_order_value_net decimal(10,2) DEFAULT 0,
  
  -- Costs (all net values)
  total_product_cost_net decimal(12,2) NOT NULL DEFAULT 0,
  total_packing_cost_net decimal(12,2) NOT NULL DEFAULT 0,
  total_shipping_cost_net decimal(12,2) NOT NULL DEFAULT 0,
  total_gateway_fees_net decimal(12,2) NOT NULL DEFAULT 0,
  total_operational_costs_net decimal(12,2) NOT NULL DEFAULT 0,
  total_costs_net decimal(12,2) NOT NULL DEFAULT 0,
  
  -- Profit metrics
  gross_profit decimal(12,2) NOT NULL DEFAULT 0,
  profit_margin decimal(5,2) DEFAULT 0,
  
  -- Cost breakdown percentages
  product_cost_percentage decimal(5,2) DEFAULT 0,
  packing_cost_percentage decimal(5,2) DEFAULT 0,
  shipping_cost_percentage decimal(5,2) DEFAULT 0,
  gateway_fee_percentage decimal(5,2) DEFAULT 0,
  operational_cost_percentage decimal(5,2) DEFAULT 0,
  
  -- Product insights
  most_profitable_product_id uuid,
  least_profitable_product_id uuid,
  products_below_target_margin integer DEFAULT 0,
  
  -- Metadata
  calculation_date timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(store_id, period_start, period_end, period_type)
);

CREATE INDEX IF NOT EXISTS idx_profit_analytics_store ON profit_analytics(store_id);
CREATE INDEX IF NOT EXISTS idx_profit_analytics_period ON profit_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_profit_analytics_margin ON profit_analytics(profit_margin);

-- =============================================
-- 4. CREATE PRICING SUGGESTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS pricing_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  
  -- Current pricing
  current_price_net decimal(10,2) NOT NULL,
  current_price_gross decimal(10,2) NOT NULL,
  current_margin decimal(5,2),
  
  -- Suggested pricing
  suggested_price_net decimal(10,2) NOT NULL,
  suggested_price_gross decimal(10,2) NOT NULL,
  suggested_margin decimal(5,2),
  
  -- Cost breakdown used
  product_cost_net decimal(10,2) NOT NULL,
  packing_cost_net decimal(10,2) DEFAULT 0,
  shipping_cost_net decimal(10,2) DEFAULT 0,
  gateway_fee_percentage decimal(5,2) DEFAULT 2.90,
  vat_rate decimal(5,2) DEFAULT 20.00,
  
  -- Reasoning
  suggestion_reason text,
  price_change_percentage decimal(5,2),
  profit_impact decimal(10,2),
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'expired')),
  applied_at timestamptz,
  applied_by text,
  rejected_reason text,
  
  -- AI insights
  competitor_price decimal(10,2),
  market_position text CHECK (market_position IN ('premium', 'competitive', 'budget', 'loss_leader')),
  confidence_score decimal(3,2),
  
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_product ON pricing_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_store ON pricing_suggestions(store_id);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_status ON pricing_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_expires ON pricing_suggestions(expires_at);

-- =============================================
-- 5. CREATE COST HISTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  
  -- Cost changes
  previous_cost_net decimal(10,2),
  new_cost_net decimal(10,2) NOT NULL,
  cost_change_amount decimal(10,2),
  cost_change_percentage decimal(5,2),
  
  -- Context
  change_reason text CHECK (change_reason IN ('supplier_update', 'bulk_discount', 'price_increase', 'manual_adjustment', 'auto_calculation')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid,
  
  -- Impact
  affected_price_net decimal(10,2),
  margin_before decimal(5,2),
  margin_after decimal(5,2),
  margin_impact decimal(5,2),
  
  -- Metadata
  changed_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_history_product ON cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_store ON cost_history(store_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_date ON cost_history(created_at);

-- =============================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE profit_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_history ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 7. RLS POLICIES - PROFIT ANALYTICS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view profit analytics" ON profit_analytics;
CREATE POLICY "Authenticated users can view profit analytics"
  ON profit_analytics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert profit analytics" ON profit_analytics;
CREATE POLICY "Authenticated users can insert profit analytics"
  ON profit_analytics FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update profit analytics" ON profit_analytics;
CREATE POLICY "Authenticated users can update profit analytics"
  ON profit_analytics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete profit analytics" ON profit_analytics;
CREATE POLICY "Authenticated users can delete profit analytics"
  ON profit_analytics FOR DELETE TO authenticated USING (true);

-- =============================================
-- 8. RLS POLICIES - PRICING SUGGESTIONS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view pricing suggestions" ON pricing_suggestions;
CREATE POLICY "Authenticated users can view pricing suggestions"
  ON pricing_suggestions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert pricing suggestions" ON pricing_suggestions;
CREATE POLICY "Authenticated users can insert pricing suggestions"
  ON pricing_suggestions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update pricing suggestions" ON pricing_suggestions;
CREATE POLICY "Authenticated users can update pricing suggestions"
  ON pricing_suggestions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete pricing suggestions" ON pricing_suggestions;
CREATE POLICY "Authenticated users can delete pricing suggestions"
  ON pricing_suggestions FOR DELETE TO authenticated USING (true);

-- =============================================
-- 9. RLS POLICIES - COST HISTORY
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view cost history" ON cost_history;
CREATE POLICY "Authenticated users can view cost history"
  ON cost_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert cost history" ON cost_history;
CREATE POLICY "Authenticated users can insert cost history"
  ON cost_history FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update cost history" ON cost_history;
CREATE POLICY "Authenticated users can update cost history"
  ON cost_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete cost history" ON cost_history;
CREATE POLICY "Authenticated users can delete cost history"
  ON cost_history FOR DELETE TO authenticated USING (true);
