/*
# Pricing Engine Completion - Competitor History, Settings, Locks, Audit

## Purpose
Completes the existing CentralHub pricing infrastructure by adding missing tables
and extending existing ones for the full competitor-aware + profit-aware pricing engine.

## New Tables

### 1. competitor_price_history
Tracks every genuine competitor price change with full metadata.
- id (uuid PK)
- competitor_price_id (FK -> competitor_prices.id)
- product_id (uuid, indexed)
- competitor_id (uuid, indexed)
- old_price (numeric)
- new_price (numeric)
- currency (text, default GBP)
- percentage_change (numeric)
- source_price_type (text: regular/sale)
- source_product_name (text)
- source_url (text)
- regular_price (numeric, nullable)
- sale_price (numeric, nullable)
- shipping_fee (numeric, default 0)
- stock_status (text, nullable)
- is_conditional (boolean, default false)
- detected_at (timestamptz)
- scan_id (text, nullable)
- created_at (timestamptz, default now())

### 2. pricing_settings
Store-specific configurable pricing engine settings.
- id (uuid PK)
- store_id (uuid FK -> stores.id, nullable for global default)
- daily_target_net_profit (numeric, default 100.00)
- target_currency (text, default GBP)
- expected_sales_window_days (integer, default 30)
- competitor_undercut_amount (numeric, default 0.10)
- pricing_mode (text, default manual: manual|automatic)
- auto_apply_enabled (boolean, default false)
- max_price_increase_percent (numeric, default 20)
- max_price_decrease_percent (numeric, default 20)
- minimum_price_floor (numeric, nullable)
- competitor_freshness_window_hours (integer, default 48)
- malluspices_auto_publish (boolean, default false)
- updated_at (timestamptz)

### 3. price_locks
Per-product/store manual pricing lock.
- id (uuid PK)
- product_id (uuid, indexed)
- store_id (uuid, nullable)
- locked_price (numeric)
- locked_by (text, nullable)
- locked_at (timestamptz, default now())
- lock_reason (text, nullable)
- is_active (boolean, default true)
- UNIQUE(product_id, store_id)

### 4. price_change_audit
Full audit trail for every price change.
- id (uuid PK)
- product_id (uuid, indexed)
- store_id (uuid, nullable)
- old_price (numeric)
- new_price (numeric)
- competitive_target (numeric, nullable)
- required_profit_price (numeric, nullable)
- final_price (numeric, nullable)
- lowest_competitor (numeric, nullable)
- average_competitor (numeric, nullable)
- cheapest_competitor (text, nullable)
- target_profit (numeric, nullable)
- allocated_overhead (numeric, nullable)
- product_cost (numeric, nullable)
- strategy (text, nullable)
- decision_reason (text, nullable)
- initiated_by (text, nullable)
- manually_approved (boolean, default false)
- automatically_applied (boolean, default false)
- malluspices_sync_status (text, default pending: pending|published|failed|skipped)
- malluspices_synced_at (timestamptz, nullable)
- created_at (timestamptz, default now())

## Extended Tables

### pricing_suggestions (new columns)
- highest_competitor_price (existing)
- in_stock_competitor_count (existing)
- our_stock (existing)
- days_of_cover (existing)
- competitive_target_price (numeric, nullable)
- required_profit_price (numeric, nullable)
- final_price (numeric, nullable)
- target_profit_contribution (numeric, nullable)
- allocated_overhead (numeric, nullable)
- decision_reason (text, nullable)
- cheapest_competitor_id (uuid, nullable)
- cheapest_competitor_name (text, nullable)
- competitor_data_age_hours (numeric, nullable)
- financial_data_age_hours (numeric, nullable)
- publication_status (text, default pending: pending|published|failed|skipped)
- applied_at (timestamptz, nullable)
- applied_by (text, nullable)
- market_position (text, nullable)

### product_economics (new columns)
- expected_daily_units (numeric, nullable)
- allocated_overhead (numeric, nullable)
- required_profit_contribution (numeric, nullable)
- required_profit_price (numeric, nullable)
- final_recommended_price (numeric, nullable)
- profitability_health (text, nullable)

### competitor_prices (new columns)
- source_stock_status (text, nullable)
- source_unit_value (numeric, nullable)
- source_unit_type (text, nullable)
- normalised_price_per_kg (numeric, nullable)
- data_quality_state (text, default FRESH)
- is_conditional (boolean, default false)
- source_regular_price (numeric, nullable)
- source_sale_price (numeric, nullable)
- source_image_url (text, nullable)
- source_sku (text, nullable)
- source_gtin (text, nullable)
- promotion_detail (text, nullable)
- discovered_at (timestamptz, nullable)

## Security
- RLS enabled on all new tables
- Policies for authenticated users (app has sign-in)
- Price locks: only authenticated users can manage
- Pricing settings: only authenticated users can manage
- History/audit: authenticated users can read

## Indexes
- competitor_price_history: product_id, competitor_id, detected_at
- price_locks: product_id, store_id
- price_change_audit: product_id, store_id, created_at
- pricing_settings: store_id (unique)
*/

-- ============================================================
-- 1. COMPETITOR PRICE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_price_id uuid REFERENCES competitor_prices(id) ON DELETE CASCADE,
  product_id uuid,
  competitor_id uuid,
  old_price numeric,
  new_price numeric,
  currency text DEFAULT 'GBP',
  percentage_change numeric,
  source_price_type text,
  source_product_name text,
  source_url text,
  regular_price numeric,
  sale_price numeric,
  shipping_fee numeric DEFAULT 0,
  stock_status text,
  is_conditional boolean DEFAULT false,
  detected_at timestamptz DEFAULT now(),
  scan_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cph_product_id ON competitor_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cph_competitor_id ON competitor_price_history(competitor_id);
CREATE INDEX IF NOT EXISTS idx_cph_detected_at ON competitor_price_history(detected_at DESC);

ALTER TABLE competitor_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_competitor_price_history" ON competitor_price_history;
CREATE POLICY "select_competitor_price_history" ON competitor_price_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_competitor_price_history" ON competitor_price_history;
CREATE POLICY "insert_competitor_price_history" ON competitor_price_history FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- 2. PRICING SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  daily_target_net_profit numeric DEFAULT 100.00,
  target_currency text DEFAULT 'GBP',
  expected_sales_window_days integer DEFAULT 30,
  competitor_undercut_amount numeric DEFAULT 0.10,
  pricing_mode text DEFAULT 'manual',
  auto_apply_enabled boolean DEFAULT false,
  max_price_increase_percent numeric DEFAULT 20,
  max_price_decrease_percent numeric DEFAULT 20,
  minimum_price_floor numeric,
  competitor_freshness_window_hours integer DEFAULT 48,
  malluspices_auto_publish boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id)
);

ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pricing_settings" ON pricing_settings;
CREATE POLICY "select_pricing_settings" ON pricing_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_pricing_settings" ON pricing_settings;
CREATE POLICY "insert_pricing_settings" ON pricing_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_pricing_settings" ON pricing_settings;
CREATE POLICY "update_pricing_settings" ON pricing_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_pricing_settings" ON pricing_settings;
CREATE POLICY "delete_pricing_settings" ON pricing_settings FOR DELETE
  TO authenticated USING (true);

-- Insert default global setting if not exists
INSERT INTO pricing_settings (store_id, daily_target_net_profit, competitor_undercut_amount)
SELECT NULL, 100.00, 0.10
WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE store_id IS NULL);

-- ============================================================
-- 3. PRICE LOCKS
-- ============================================================
CREATE TABLE IF NOT EXISTS price_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  store_id uuid,
  locked_price numeric NOT NULL,
  locked_by text,
  locked_at timestamptz DEFAULT now(),
  lock_reason text,
  is_active boolean DEFAULT true,
  UNIQUE(product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_price_locks_product ON price_locks(product_id);
CREATE INDEX IF NOT EXISTS idx_price_locks_store ON price_locks(store_id);
CREATE INDEX IF NOT EXISTS idx_price_locks_active ON price_locks(is_active) WHERE is_active = true;

ALTER TABLE price_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_price_locks" ON price_locks;
CREATE POLICY "select_price_locks" ON price_locks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_price_locks" ON price_locks;
CREATE POLICY "insert_price_locks" ON price_locks FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_price_locks" ON price_locks;
CREATE POLICY "update_price_locks" ON price_locks FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_price_locks" ON price_locks;
CREATE POLICY "delete_price_locks" ON price_locks FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 4. PRICE CHANGE AUDIT
-- ============================================================
CREATE TABLE IF NOT EXISTS price_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  store_id uuid,
  old_price numeric,
  new_price numeric,
  competitive_target numeric,
  required_profit_price numeric,
  final_price numeric,
  lowest_competitor numeric,
  average_competitor numeric,
  cheapest_competitor text,
  target_profit numeric,
  allocated_overhead numeric,
  product_cost numeric,
  strategy text,
  decision_reason text,
  initiated_by text,
  manually_approved boolean DEFAULT false,
  automatically_applied boolean DEFAULT false,
  malluspices_sync_status text DEFAULT 'pending',
  malluspices_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pca_product ON price_change_audit(product_id);
CREATE INDEX IF NOT EXISTS idx_pca_store ON price_change_audit(store_id);
CREATE INDEX IF NOT EXISTS idx_pca_created ON price_change_audit(created_at DESC);

ALTER TABLE price_change_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_price_change_audit" ON price_change_audit;
CREATE POLICY "select_price_change_audit" ON price_change_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_price_change_audit" ON price_change_audit;
CREATE POLICY "insert_price_change_audit" ON price_change_audit FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- 5. EXTEND pricing_suggestions
-- ============================================================
DO $$ BEGIN
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS competitive_target_price numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS required_profit_price numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS final_price numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS target_profit_contribution numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS allocated_overhead numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS decision_reason text;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS cheapest_competitor_id uuid;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS cheapest_competitor_name text;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS competitor_data_age_hours numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS financial_data_age_hours numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS publication_status text DEFAULT 'pending';
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS applied_at timestamptz;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS applied_by text;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS market_position text;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS highest_competitor_price numeric;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS in_stock_competitor_count integer;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS our_stock integer;
  ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS days_of_cover numeric;
END $$;

-- ============================================================
-- 6. EXTEND product_economics
-- ============================================================
DO $$ BEGIN
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS expected_daily_units numeric;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS allocated_overhead numeric;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS required_profit_contribution numeric;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS required_profit_price numeric;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS final_recommended_price numeric;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS profitability_health text;
  ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS store_id uuid;
END $$;

-- ============================================================
-- 7. EXTEND competitor_prices
-- ============================================================
DO $$ BEGIN
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_stock_status text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_unit_value numeric;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_unit_type text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS normalised_price_per_kg numeric;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS data_quality_state text DEFAULT 'FRESH';
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS is_conditional boolean DEFAULT false;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_regular_price numeric;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_sale_price numeric;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_image_url text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_sku text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS source_gtin text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS promotion_detail text;
  ALTER TABLE competitor_prices ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
END $$;

-- ============================================================
-- 8. MARKET ANALYTICS RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_market_analytics(p_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'product_id', p_product_id,
    'lowest_competitor_price', MIN(cp.price),
    'highest_competitor_price', MAX(cp.price),
    'average_competitor_price', AVG(cp.price),
    'median_competitor_price', (
      SELECT AVG(price) FROM (
        SELECT price, ROW_NUMBER() OVER (ORDER BY price) as rn, COUNT(*) OVER() as cnt
        FROM competitor_prices
        WHERE product_id = p_product_id
          AND scan_status = 'success'
          AND match_status IN ('automatic', 'manual')
          AND brand_match = true
          AND size_match = true
          AND product_type_match = true
          AND is_conditional = false
          AND price > 0
        ORDER BY price
      ) ranked WHERE rn IN (FLOOR((cnt + 1) / 2.0), CEIL((cnt + 1) / 2.0))
    ),
    'valid_competitor_count', COUNT(*),
    'in_stock_count', COUNT(*) FILTER (WHERE source_stock_status IS NULL OR lower(source_stock_status) NOT IN ('out of stock', 'outofstock', 'unavailable')),
    'cheapest_competitor_id', (
      SELECT competitor_id FROM competitor_prices
      WHERE product_id = p_product_id AND scan_status = 'success'
        AND match_status IN ('automatic', 'manual')
        AND brand_match = true AND size_match = true AND product_type_match = true
        AND is_conditional = false AND price > 0
      ORDER BY price ASC LIMIT 1
    ),
    'cheapest_competitor_name', (
      SELECT c.name FROM competitor_prices cp
      JOIN competitors c ON c.id = cp.competitor_id
      WHERE cp.product_id = p_product_id AND cp.scan_status = 'success'
        AND cp.match_status IN ('automatic', 'manual')
        AND cp.brand_match = true AND cp.size_match = true AND cp.product_type_match = true
        AND cp.is_conditional = false AND cp.price > 0
      ORDER BY cp.price ASC LIMIT 1
    ),
    'cheapest_competitor_url', (
      SELECT cp.product_url FROM competitor_prices cp
      WHERE cp.product_id = p_product_id AND cp.scan_status = 'success'
        AND cp.match_status IN ('automatic', 'manual')
        AND cp.brand_match = true AND cp.size_match = true AND cp.product_type_match = true
        AND cp.is_conditional = false AND cp.price > 0
      ORDER BY cp.price ASC LIMIT 1
    ),
    'freshest_scan_at', MAX(cp.last_scanned_at),
    'stale_count', COUNT(*) FILTER (WHERE cp.last_scanned_at IS NULL OR cp.last_scanned_at < now() - interval '48 hours')
  )
  INTO result
  FROM competitor_prices cp
  WHERE cp.product_id = p_product_id
    AND cp.scan_status = 'success'
    AND cp.match_status IN ('automatic', 'manual')
    AND cp.brand_match = true
    AND cp.size_match = true
    AND cp.product_type_match = true
    AND cp.is_conditional = false
    AND cp.price > 0;

  RETURN COALESCE(result, json_build_object('product_id', p_product_id, 'valid_competitor_count', 0));
END;
$$;

-- ============================================================
-- 9. PROFITABILITY PRICING ENGINE RPC
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_required_profit_price(
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_daily_target numeric DEFAULT 100.00,
  p_sales_window_days integer DEFAULT 30,
  p_undercut_amount numeric DEFAULT 0.10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
  v_current_price numeric;
  v_expected_daily_units numeric;
  v_total_daily_units numeric;
  v_daily_overhead numeric;
  v_target_profit_per_unit numeric;
  v_required_profit_price numeric;
  v_market json;
  v_lowest_competitor numeric;
  v_competitive_target numeric;
  v_final_price numeric;
  v_decision_reason text;
  v_min_margin numeric;
  v_margin_floor numeric;
  v_margin_floor_price numeric;
  v_product_name text;
  v_has_sales boolean;
BEGIN
  -- Get product info
  SELECT price, cost_price, min_margin, name INTO v_current_price, v_cost, v_min_margin, v_product_name
  FROM products WHERE id = p_product_id AND is_deleted = false AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Product not found or inactive');
  END IF;

  v_cost := COALESCE(v_cost, 0);
  v_current_price := COALESCE(v_current_price, 0);

  -- Get market analytics
  SELECT get_market_analytics(p_product_id) INTO v_market;
  v_lowest_competitor := (v_market->>'lowest_competitor_price')::numeric;

  -- Calculate expected daily units from actual sales
  SELECT SUM(quantity) / GREATEST(p_sales_window_days, 1)
  INTO v_expected_daily_units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.payment_status = 'paid'
    AND o.created_at >= now() - (p_sales_window_days || ' days')::interval
    AND (p_store_id IS NULL OR o.store_id = p_store_id);

  v_has_sales := v_expected_daily_units IS NOT NULL AND v_expected_daily_units > 0;

  -- Calculate total daily units across store for overhead allocation
  IF p_store_id IS NOT NULL THEN
    SELECT SUM(quantity) / GREATEST(p_sales_window_days, 1)
    INTO v_total_daily_units
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid'
      AND o.created_at >= now() - (p_sales_window_days || ' days')::interval
      AND o.store_id = p_store_id;
  ELSE
    SELECT SUM(quantity) / GREATEST(p_sales_window_days, 1)
    INTO v_total_daily_units
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid'
      AND o.created_at >= now() - (p_sales_window_days || ' days')::interval;
  END IF;

  v_total_daily_units := COALESCE(v_total_daily_units, 0);
  IF v_total_daily_units = 0 THEN v_total_daily_units := 1; END IF;

  -- Calculate daily operating overhead from expenses (last 30 days)
  SELECT COALESCE(SUM(amount_gross), 0) / GREATEST(p_sales_window_days, 1)
  INTO v_daily_overhead
  FROM expenses
  WHERE invoice_date >= now() - (p_sales_window_days || ' days')::interval
    AND (p_store_id IS NULL OR store_id = p_store_id);

  v_daily_overhead := COALESCE(v_daily_overhead, 0);

  -- Calculate target profit contribution per unit
  IF v_has_sales THEN
    v_target_profit_per_unit := p_daily_target / v_total_daily_units;
    -- Allocate overhead proportionally to sales volume
    DECLARE
      v_product_daily_units numeric;
    BEGIN
      v_product_daily_units := COALESCE(v_expected_daily_units, 0);
      IF v_product_daily_units > 0 THEN
        v_target_profit_per_unit := p_daily_target / v_total_daily_units;
      ELSE
        v_target_profit_per_unit := p_daily_target; -- No sales history: full target per unit (will be flagged)
      END IF;
    END;
  ELSE
    v_target_profit_per_unit := NULL; -- No sales history
  END IF;

  -- Calculate required profit price
  IF v_cost > 0 AND v_target_profit_per_unit IS NOT NULL THEN
    v_required_profit_price := v_cost + (v_daily_overhead / GREATEST(v_total_daily_units, 1)) + v_target_profit_per_unit;
  ELSE
    v_required_profit_price := NULL;
  END IF;

  -- Calculate margin floor (existing min_margin safety)
  v_min_margin := COALESCE(v_min_margin, 8);
  IF v_min_margin > 0 AND v_cost > 0 THEN
    v_margin_floor_price := v_cost / (1 - (v_min_margin / 100));
  ELSE
    v_margin_floor_price := v_cost;
  END IF;

  -- Calculate competitive target
  IF v_lowest_competitor IS NOT NULL AND v_lowest_competitor > 0 THEN
    v_competitive_target := ROUND((v_lowest_competitor - p_undercut_amount)::numeric, 2);
    IF v_competitive_target <= 0 THEN v_competitive_target := 0.01; END IF;
  ELSE
    v_competitive_target := NULL;
  END IF;

  -- FINAL PRICE DECISION: MAX(competitive_target, required_profit_price, margin_floor)
  v_final_price := COALESCE(v_margin_floor_price, v_cost);

  IF v_competitive_target IS NOT NULL THEN
    v_final_price := GREATEST(v_final_price, v_competitive_target);
  END IF;

  IF v_required_profit_price IS NOT NULL THEN
    v_final_price := GREATEST(v_final_price, v_required_profit_price);
  END IF;

  v_final_price := ROUND(v_final_price, 2);

  -- Decision reason
  IF v_lowest_competitor IS NULL THEN
    v_decision_reason := 'NO_VALID_COMPETITOR_DATA';
  ELSIF v_required_profit_price IS NULL THEN
    v_decision_reason := 'MISSING_SALES_FORECAST';
  ELSIF v_cost = 0 OR v_cost IS NULL THEN
    v_decision_reason := 'MISSING_COST';
  ELSIF v_competitive_target >= v_required_profit_price THEN
    v_decision_reason := 'COMPETE_BELOW_LOWEST';
  ELSIF v_required_profit_price > v_competitive_target THEN
    v_decision_reason := 'PROTECT_REQUIRED_PROFIT';
  ELSE
    v_decision_reason := 'PROTECT_MINIMUM_MARGIN';
  END IF;

  RETURN json_build_object(
    'product_id', p_product_id,
    'product_name', v_product_name,
    'cost_price', v_cost,
    'current_price', v_current_price,
    'lowest_competitor', v_lowest_competitor,
    'competitive_target', v_competitive_target,
    'required_profit_price', v_required_profit_price,
    'margin_floor_price', v_margin_floor_price,
    'final_recommended_price', v_final_price,
    'decision_reason', v_decision_reason,
    'expected_daily_units', v_expected_daily_units,
    'total_daily_units', v_total_daily_units,
    'daily_overhead', v_daily_overhead,
    'target_profit_per_unit', v_target_profit_per_unit,
    'has_sales_history', v_has_sales,
    'market_analytics', v_market
  );
END;
$$;

-- ============================================================
-- 10. REFRESH COMPETITOR DATA QUALITY RPC
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_competitor_data_quality()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE competitor_prices SET data_quality_state = 'FRESH'
  WHERE last_scanned_at IS NOT NULL
    AND last_scanned_at >= now() - interval '24 hours'
    AND scan_status = 'success';

  UPDATE competitor_prices SET data_quality_state = 'AGING'
  WHERE last_scanned_at IS NOT NULL
    AND last_scanned_at < now() - interval '24 hours'
    AND last_scanned_at >= now() - interval '48 hours';

  UPDATE competitor_prices SET data_quality_state = 'STALE'
  WHERE last_scanned_at IS NOT NULL
    AND last_scanned_at < now() - interval '48 hours';

  UPDATE competitor_prices SET data_quality_state = 'FAILED'
  WHERE scan_status = 'failed';

  UPDATE competitor_prices SET data_quality_state = 'PENDING_MATCH'
  WHERE match_status = 'pending' AND scan_status = 'success';

  UPDATE competitor_prices SET data_quality_state = 'INVALID_MATCH'
  WHERE (brand_match = false OR size_match = false OR product_type_match = false)
    AND match_status IN ('automatic', 'manual');

  UPDATE competitor_prices SET data_quality_state = 'NO_DATA'
  WHERE last_scanned_at IS NULL;
END;
$$;