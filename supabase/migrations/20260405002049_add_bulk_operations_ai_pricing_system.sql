/*
  # Bulk Operations, AI Pricing Optimization, and Product Analytics System

  1. New Tables
    - `product_metrics` - Track product performance metrics for AI pricing
    - `product_seo_data` - Store SEO metadata for products
    - `bulk_operations_log` - Audit trail for bulk operations
    - `ai_suggestions_log` - Track AI-generated suggestions
    
  2. Product Metrics
    - Sales tracking (7-day, 30-day)
    - Stock level monitoring
    - Expiry tracking
    - Demand score calculation
    - Price optimization suggestions
    
  3. SEO System
    - SEO title, meta description, keywords
    - Auto-generated slugs
    - Bulk SEO generation support
    
  4. Bulk Operations
    - Audit logging
    - Safety checks
    - Rollback support
    
  5. Functions
    - `calculate_demand_score()` - Calculate product demand
    - `suggest_optimal_price()` - AI price optimization
    - `generate_product_slug()` - Auto slug generation
    - `fuzzy_match_brand()` - Brand matching
    
  6. Indexes
    - Performance indexes for analytics queries
    
  7. Security
    - RLS policies for all new tables
*/

-- Product Metrics Table
CREATE TABLE IF NOT EXISTS product_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Sales metrics
  sales_last_7_days integer DEFAULT 0,
  sales_last_30_days integer DEFAULT 0,
  revenue_last_7_days numeric DEFAULT 0,
  revenue_last_30_days numeric DEFAULT 0,
  
  -- Stock metrics
  current_stock_level integer DEFAULT 0,
  days_to_expiry integer,
  expiry_date date,
  
  -- Performance metrics
  demand_score numeric DEFAULT 0,
  velocity_score numeric DEFAULT 0,
  profitability_score numeric DEFAULT 0,
  
  -- Price optimization
  suggested_price numeric,
  suggested_price_reason text,
  price_optimization_applied boolean DEFAULT false,
  last_optimization_at timestamptz,
  
  -- Timestamps
  metrics_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(product_id, store_id, metrics_date)
);

ALTER TABLE product_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage product metrics"
  ON product_metrics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Product SEO Data Table
CREATE TABLE IF NOT EXISTS product_seo_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- SEO fields
  seo_title text,
  meta_description text,
  keywords text[],
  slug text UNIQUE,
  
  -- Generation metadata
  generated_by_ai boolean DEFAULT false,
  ai_confidence_score numeric,
  last_generated_at timestamptz,
  
  -- Manual overrides
  manual_override boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(product_id)
);

ALTER TABLE product_seo_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage SEO data"
  ON product_seo_data FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Bulk Operations Log
CREATE TABLE IF NOT EXISTS bulk_operations_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL CHECK (operation_type IN ('edit', 'pricing', 'delete', 'seo_generate', 'price_optimize')),
  
  -- Operation details
  product_ids uuid[] NOT NULL,
  changes jsonb NOT NULL,
  affected_count integer NOT NULL,
  
  -- Rollback support
  previous_state jsonb,
  can_rollback boolean DEFAULT true,
  rolled_back boolean DEFAULT false,
  rollback_at timestamptz,
  
  -- Audit
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz DEFAULT now(),
  
  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'rolled_back')),
  error_message text
);

ALTER TABLE bulk_operations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage bulk operations log"
  ON bulk_operations_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- AI Suggestions Log
CREATE TABLE IF NOT EXISTS ai_suggestions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('seo', 'pricing', 'category', 'brand', 'product_parse')),
  
  -- Input/Output
  input_data jsonb NOT NULL,
  output_data jsonb NOT NULL,
  
  -- Metadata
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  confidence_score numeric,
  
  -- User action
  accepted boolean,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_suggestions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage AI suggestions log"
  ON ai_suggestions_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_metrics_product_store ON product_metrics(product_id, store_id);
CREATE INDEX IF NOT EXISTS idx_product_metrics_date ON product_metrics(metrics_date DESC);
CREATE INDEX IF NOT EXISTS idx_product_metrics_demand ON product_metrics(demand_score DESC) WHERE demand_score > 0;
CREATE INDEX IF NOT EXISTS idx_product_metrics_expiry ON product_metrics(days_to_expiry ASC) WHERE days_to_expiry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_seo_slug ON product_seo_data(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_seo_product ON product_seo_data(product_id);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_type ON bulk_operations_log(operation_type, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_ops_user ON bulk_operations_log(performed_by, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type ON ai_suggestions_log(suggestion_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_product ON ai_suggestions_log(product_id) WHERE product_id IS NOT NULL;

-- Function to calculate demand score
CREATE OR REPLACE FUNCTION calculate_demand_score(
  p_sales_7_days integer,
  p_sales_30_days integer,
  p_stock_level integer,
  p_days_to_expiry integer DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
  v_demand_score numeric := 0;
  v_velocity_score numeric := 0;
  v_urgency_multiplier numeric := 1;
BEGIN
  -- Avoid division by zero
  IF p_stock_level = 0 OR p_stock_level IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate velocity (daily sales rate)
  v_velocity_score := (p_sales_7_days::numeric / 7.0) / NULLIF(p_stock_level, 0);
  
  -- Apply urgency multiplier for near-expiry items
  IF p_days_to_expiry IS NOT NULL THEN
    IF p_days_to_expiry <= 3 THEN
      v_urgency_multiplier := 2.0;  -- Very urgent
    ELSIF p_days_to_expiry <= 7 THEN
      v_urgency_multiplier := 1.5;  -- Urgent
    ELSIF p_days_to_expiry <= 14 THEN
      v_urgency_multiplier := 1.2;  -- Moderately urgent
    END IF;
  END IF;
  
  -- Final demand score
  v_demand_score := v_velocity_score * v_urgency_multiplier;
  
  RETURN ROUND(v_demand_score, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to suggest optimal price based on metrics
CREATE OR REPLACE FUNCTION suggest_optimal_price(
  p_current_price numeric,
  p_demand_score numeric,
  p_days_to_expiry integer DEFAULT NULL,
  p_sales_7_days integer DEFAULT 0,
  p_stock_level integer DEFAULT 0
)
RETURNS TABLE(
  suggested_price numeric,
  price_change_percent numeric,
  reason text,
  urgency text
) AS $$
DECLARE
  v_suggested_price numeric;
  v_price_change_percent numeric;
  v_reason text;
  v_urgency text := 'normal';
BEGIN
  v_suggested_price := p_current_price;
  
  -- Near expiry items - aggressive discounting
  IF p_days_to_expiry IS NOT NULL THEN
    IF p_days_to_expiry <= 1 THEN
      v_suggested_price := p_current_price * 0.50;  -- 50% off
      v_reason := 'Expires in 1 day - clearance pricing';
      v_urgency := 'critical';
    ELSIF p_days_to_expiry <= 3 THEN
      v_suggested_price := p_current_price * 0.70;  -- 30% off
      v_reason := 'Expires in ' || p_days_to_expiry || ' days - urgent clearance';
      v_urgency := 'high';
    ELSIF p_days_to_expiry <= 7 THEN
      v_suggested_price := p_current_price * 0.85;  -- 15% off
      v_reason := 'Expires in ' || p_days_to_expiry || ' days - promote sales';
      v_urgency := 'medium';
    ELSIF p_days_to_expiry <= 14 THEN
      v_suggested_price := p_current_price * 0.95;  -- 5% off
      v_reason := 'Expires in ' || p_days_to_expiry || ' days - gentle discount';
      v_urgency := 'low';
    END IF;
  
  -- High demand - can increase price
  ELSIF p_demand_score > 1.5 AND p_sales_7_days > 10 THEN
    v_suggested_price := p_current_price * 1.10;  -- 10% increase
    v_reason := 'High demand detected - optimize margin';
    v_urgency := 'low';
  
  ELSIF p_demand_score > 1.0 AND p_sales_7_days > 5 THEN
    v_suggested_price := p_current_price * 1.05;  -- 5% increase
    v_reason := 'Good demand - slight price increase';
    v_urgency := 'low';
  
  -- Low demand - decrease price to stimulate sales
  ELSIF p_demand_score < 0.3 AND p_stock_level > 20 THEN
    v_suggested_price := p_current_price * 0.90;  -- 10% decrease
    v_reason := 'Low sales velocity - reduce price to move stock';
    v_urgency := 'medium';
  
  ELSIF p_demand_score < 0.5 AND p_stock_level > 10 THEN
    v_suggested_price := p_current_price * 0.95;  -- 5% decrease
    v_reason := 'Slow moving - gentle discount';
    v_urgency := 'low';
  
  ELSE
    v_reason := 'Current price is optimal';
    v_urgency := 'none';
  END IF;
  
  -- Calculate percentage change
  v_price_change_percent := ((v_suggested_price - p_current_price) / NULLIF(p_current_price, 0)) * 100;
  
  RETURN QUERY SELECT
    ROUND(v_suggested_price, 2) AS suggested_price,
    ROUND(v_price_change_percent, 2) AS price_change_percent,
    v_reason AS reason,
    v_urgency AS urgency;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to generate SEO-friendly slug
CREATE OR REPLACE FUNCTION generate_product_slug(
  p_product_name text,
  p_brand_name text DEFAULT NULL,
  p_variant text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  v_slug text;
  v_counter integer := 0;
  v_base_slug text;
BEGIN
  -- Combine name, brand, variant
  v_base_slug := LOWER(TRIM(
    COALESCE(p_brand_name, '') || ' ' ||
    COALESCE(p_product_name, '') || ' ' ||
    COALESCE(p_variant, '')
  ));
  
  -- Replace spaces with hyphens, remove special chars
  v_base_slug := REGEXP_REPLACE(v_base_slug, '[^a-z0-9\s-]', '', 'g');
  v_base_slug := REGEXP_REPLACE(v_base_slug, '\s+', '-', 'g');
  v_base_slug := REGEXP_REPLACE(v_base_slug, '-+', '-', 'g');
  v_base_slug := TRIM(BOTH '-' FROM v_base_slug);
  
  v_slug := v_base_slug;
  
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM product_seo_data WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;
  
  RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to update product metrics
CREATE OR REPLACE FUNCTION update_product_metrics(
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_sales_7_days integer;
  v_sales_30_days integer;
  v_revenue_7_days numeric;
  v_revenue_30_days numeric;
  v_stock_level integer;
  v_demand_score numeric;
BEGIN
  -- Calculate sales from orders (last 7 days)
  SELECT COALESCE(SUM(oi.quantity), 0), COALESCE(SUM(oi.price * oi.quantity), 0)
  INTO v_sales_7_days, v_revenue_7_days
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.product_id = p_product_id
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND o.created_at >= NOW() - INTERVAL '7 days';
  
  -- Calculate sales from orders (last 30 days)
  SELECT COALESCE(SUM(oi.quantity), 0), COALESCE(SUM(oi.price * oi.quantity), 0)
  INTO v_sales_30_days, v_revenue_30_days
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.product_id = p_product_id
    AND (p_store_id IS NULL OR o.store_id = p_store_id)
    AND o.created_at >= NOW() - INTERVAL '30 days';
  
  -- Get current stock level
  SELECT COALESCE(stock_quantity, 0)
  INTO v_stock_level
  FROM products
  WHERE id = p_product_id;
  
  -- Calculate demand score
  v_demand_score := calculate_demand_score(
    v_sales_7_days,
    v_sales_30_days,
    v_stock_level,
    NULL
  );
  
  -- Insert or update metrics
  INSERT INTO product_metrics (
    product_id,
    store_id,
    sales_last_7_days,
    sales_last_30_days,
    revenue_last_7_days,
    revenue_last_30_days,
    current_stock_level,
    demand_score,
    metrics_date
  ) VALUES (
    p_product_id,
    p_store_id,
    v_sales_7_days,
    v_sales_30_days,
    v_revenue_7_days,
    v_revenue_30_days,
    v_stock_level,
    v_demand_score,
    CURRENT_DATE
  )
  ON CONFLICT (product_id, store_id, metrics_date)
  DO UPDATE SET
    sales_last_7_days = EXCLUDED.sales_last_7_days,
    sales_last_30_days = EXCLUDED.sales_last_30_days,
    revenue_last_7_days = EXCLUDED.revenue_last_7_days,
    revenue_last_30_days = EXCLUDED.revenue_last_30_days,
    current_stock_level = EXCLUDED.current_stock_level,
    demand_score = EXCLUDED.demand_score,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to fuzzy match brand name
CREATE OR REPLACE FUNCTION fuzzy_match_brand(
  p_brand_name text,
  p_similarity_threshold numeric DEFAULT 0.6
)
RETURNS TABLE(
  brand_id uuid,
  brand_name text,
  similarity_score numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS brand_id,
    b.name AS brand_name,
    GREATEST(
      -- Exact match
      CASE WHEN LOWER(b.name) = LOWER(p_brand_name) THEN 1.0 ELSE 0.0 END,
      -- Contains match
      CASE WHEN LOWER(b.name) LIKE '%' || LOWER(p_brand_name) || '%' THEN 0.8 ELSE 0.0 END,
      -- Reverse contains
      CASE WHEN LOWER(p_brand_name) LIKE '%' || LOWER(b.name) || '%' THEN 0.7 ELSE 0.0 END,
      -- First word match
      CASE WHEN SPLIT_PART(LOWER(b.name), ' ', 1) = SPLIT_PART(LOWER(p_brand_name), ' ', 1) THEN 0.6 ELSE 0.0 END
    ) AS similarity_score
  FROM brands b
  WHERE GREATEST(
    CASE WHEN LOWER(b.name) = LOWER(p_brand_name) THEN 1.0 ELSE 0.0 END,
    CASE WHEN LOWER(b.name) LIKE '%' || LOWER(p_brand_name) || '%' THEN 0.8 ELSE 0.0 END,
    CASE WHEN LOWER(p_brand_name) LIKE '%' || LOWER(b.name) || '%' THEN 0.7 ELSE 0.0 END,
    CASE WHEN SPLIT_PART(LOWER(b.name), ' ', 1) = SPLIT_PART(LOWER(p_brand_name), ' ', 1) THEN 0.6 ELSE 0.0 END
  ) >= p_similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to auto-update product metrics timestamp
CREATE OR REPLACE FUNCTION update_product_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_metrics_timestamp ON product_metrics;
CREATE TRIGGER trigger_update_product_metrics_timestamp
  BEFORE UPDATE ON product_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_product_metrics_timestamp();

-- Trigger to auto-update SEO data timestamp
CREATE OR REPLACE FUNCTION update_seo_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_seo_data_timestamp ON product_seo_data;
CREATE TRIGGER trigger_update_seo_data_timestamp
  BEFORE UPDATE ON product_seo_data
  FOR EACH ROW
  EXECUTE FUNCTION update_seo_data_timestamp();

-- Helpful comments
COMMENT ON TABLE product_metrics IS 'Track product performance metrics for AI-driven pricing optimization';
COMMENT ON TABLE product_seo_data IS 'Store SEO metadata for products with AI generation support';
COMMENT ON TABLE bulk_operations_log IS 'Audit trail for all bulk operations with rollback support';
COMMENT ON TABLE ai_suggestions_log IS 'Log of all AI-generated suggestions and user acceptance';

COMMENT ON FUNCTION calculate_demand_score IS 'Calculate product demand score based on sales velocity and urgency';
COMMENT ON FUNCTION suggest_optimal_price IS 'AI-powered price optimization based on demand, stock, and expiry';
COMMENT ON FUNCTION generate_product_slug IS 'Generate unique SEO-friendly slug for products';
COMMENT ON FUNCTION fuzzy_match_brand IS 'Match brand names using fuzzy logic for auto-mapping';
COMMENT ON FUNCTION update_product_metrics IS 'Update product metrics from order data';
