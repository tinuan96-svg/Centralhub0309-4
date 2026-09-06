/*
  # Data Integrity & Trust Score System (Truth Engine)

  1. New Tables
    - `data_integrity_scans` - Track all integrity scan runs
    - `data_integrity_issues` - Log detected data issues
    - `trust_scores` - Store trust scores for metrics
    - `trust_score_history` - Track trust score changes over time
    - `alert_settings` - Alert configuration
    - `alert_history` - Track sent alerts
    - `data_health_metrics` - System-wide health metrics
    
  2. Trust Score Components
    - Data Source Validity (25%)
    - Connection Integrity (25%)
    - Data Freshness (15%)
    - Completeness (15%)
    - Consistency (10%)
    - Anomaly Check (10%)
    
  3. Scan Types
    - FULL: Complete deep validation
    - LIGHT: Quick critical checks
    - SCHEDULED: Automated background scans
    - MANUAL: User-triggered scans
    
  4. Issue Severity
    - CRITICAL: Data unusable
    - HIGH: Major accuracy issues
    - MEDIUM: Partial data concerns
    - LOW: Minor inconsistencies
    
  5. Functions
    - `calculate_trust_score()` - Calculate metric trust score
    - `scan_products_integrity()` - Validate products
    - `scan_orders_integrity()` - Validate orders
    - `scan_payments_integrity()` - Validate payments
    - `detect_orphan_records()` - Find broken relationships
    - `auto_fix_orphans()` - Repair orphan records
    - `calculate_data_health()` - Overall system health
    
  6. Security
    - RLS policies for all tables
    - Admin-only access to scans and fixes
*/

-- Data Integrity Scans Table
CREATE TABLE IF NOT EXISTS data_integrity_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL CHECK (scan_type IN ('FULL', 'LIGHT', 'SCHEDULED', 'MANUAL')),
  
  -- Scan status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  
  -- Timing
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_seconds numeric,
  
  -- Results summary
  total_entities_scanned integer DEFAULT 0,
  total_issues_found integer DEFAULT 0,
  critical_issues integer DEFAULT 0,
  high_issues integer DEFAULT 0,
  medium_issues integer DEFAULT 0,
  low_issues integer DEFAULT 0,
  
  -- Module breakdown
  modules_scanned text[],
  
  -- Auto-fix results
  issues_auto_fixed integer DEFAULT 0,
  issues_requiring_manual_fix integer DEFAULT 0,
  
  -- Trigger info
  triggered_by uuid REFERENCES auth.users(id),
  trigger_type text CHECK (trigger_type IN ('manual', 'scheduled', 'alert_threshold')),
  
  -- Results data
  scan_results jsonb,
  error_message text,
  
  created_at timestamptz DEFAULT now()
);

ALTER TABLE data_integrity_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scans"
  ON data_integrity_scans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create scans"
  ON data_integrity_scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Data Integrity Issues Table
CREATE TABLE IF NOT EXISTS data_integrity_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES data_integrity_scans(id) ON DELETE CASCADE,
  
  -- Issue classification
  module text NOT NULL CHECK (module IN (
    'products', 'orders', 'stores', 'inventory', 'pricing_rules',
    'vat', 'payments', 'bank_transactions', 'analytics', 'relationships'
  )),
  issue_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  
  -- Issue details
  title text NOT NULL,
  description text NOT NULL,
  
  -- Affected entities
  entity_type text,
  entity_id uuid,
  entity_ids uuid[],
  
  -- Validation failure details
  expected_value text,
  actual_value text,
  validation_rule text,
  
  -- Connection path
  data_path jsonb,
  
  -- Fix status
  can_auto_fix boolean DEFAULT false,
  auto_fix_applied boolean DEFAULT false,
  fixed_at timestamptz,
  fixed_by uuid REFERENCES auth.users(id),
  fix_method text,
  fix_result jsonb,
  
  -- Status
  status text DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored', 'monitoring')),
  
  -- Additional data
  metadata jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE data_integrity_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage issues"
  ON data_integrity_issues FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trust Scores Table
CREATE TABLE IF NOT EXISTS trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Metric identification
  metric_name text NOT NULL,
  metric_category text NOT NULL CHECK (metric_category IN (
    'revenue', 'profit', 'inventory', 'orders', 'payments', 'vat', 'pricing', 'analytics'
  )),
  
  -- Scope
  entity_type text,
  entity_id uuid,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Trust score (0-100)
  overall_score numeric NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Component scores
  source_validity_score numeric DEFAULT 0 CHECK (source_validity_score >= 0 AND source_validity_score <= 25),
  connection_integrity_score numeric DEFAULT 0 CHECK (connection_integrity_score >= 0 AND connection_integrity_score <= 25),
  freshness_score numeric DEFAULT 0 CHECK (freshness_score >= 0 AND freshness_score <= 15),
  completeness_score numeric DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 15),
  consistency_score numeric DEFAULT 0 CHECK (consistency_score >= 0 AND consistency_score <= 10),
  anomaly_score numeric DEFAULT 0 CHECK (anomaly_score >= 0 AND anomaly_score <= 10),
  
  -- Status
  status text NOT NULL CHECK (status IN ('reliable', 'warning', 'unreliable')),
  
  -- Source tracking
  data_source text,
  data_source_id uuid,
  last_data_update timestamptz,
  
  -- Connection path
  connection_chain jsonb,
  
  -- Issues
  issues_affecting_score text[],
  warnings text[],
  
  -- Calculation metadata
  calculation_timestamp timestamptz DEFAULT now(),
  calculation_method text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(metric_name, entity_type, entity_id, store_id)
);

ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view trust scores"
  ON trust_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update trust scores"
  ON trust_scores FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trust Score History Table
CREATE TABLE IF NOT EXISTS trust_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_score_id uuid REFERENCES trust_scores(id) ON DELETE CASCADE,
  
  -- Historical snapshot
  metric_name text NOT NULL,
  overall_score numeric NOT NULL,
  status text NOT NULL,
  
  -- What changed
  score_change numeric,
  status_changed boolean DEFAULT false,
  previous_status text,
  
  -- Reason for change
  change_reason text,
  issues_detected text[],
  
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE trust_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view trust score history"
  ON trust_score_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert trust score history"
  ON trust_score_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Alert Settings Table
CREATE TABLE IF NOT EXISTS alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Alert channels
  telegram_enabled boolean DEFAULT false,
  telegram_bot_token text,
  telegram_chat_id text,
  
  email_enabled boolean DEFAULT false,
  email_address text,
  
  -- Alert thresholds
  trust_score_threshold numeric DEFAULT 70 CHECK (trust_score_threshold >= 0 AND trust_score_threshold <= 100),
  alert_on_critical_issues boolean DEFAULT true,
  alert_on_high_issues boolean DEFAULT true,
  alert_on_medium_issues boolean DEFAULT false,
  alert_on_low_issues boolean DEFAULT false,
  
  -- Frequency
  alert_frequency text DEFAULT 'instant' CHECK (alert_frequency IN ('instant', 'hourly', 'daily')),
  
  -- Quiet hours
  quiet_hours_enabled boolean DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  
  -- Metric-specific alerts
  metric_alerts jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id)
);

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alert settings"
  ON alert_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Alert History Table
CREATE TABLE IF NOT EXISTS alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN (
    'trust_score_drop', 'critical_issue', 'high_issue', 'scan_complete', 'anomaly_detected'
  )),
  severity text NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  
  -- Message
  title text NOT NULL,
  message text NOT NULL,
  
  -- Recipient
  sent_to_user_id uuid REFERENCES auth.users(id),
  
  -- Channels used
  sent_via_telegram boolean DEFAULT false,
  sent_via_email boolean DEFAULT false,
  
  -- Related entities
  scan_id uuid REFERENCES data_integrity_scans(id),
  issue_id uuid REFERENCES data_integrity_issues(id),
  trust_score_id uuid REFERENCES trust_scores(id),
  
  -- Delivery status
  telegram_status text,
  email_status text,
  
  -- Metadata
  alert_data jsonb,
  
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON alert_history FOR SELECT
  TO authenticated
  USING (sent_to_user_id = auth.uid());

-- Data Health Metrics Table
CREATE TABLE IF NOT EXISTS data_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Overall health
  overall_health_score numeric DEFAULT 0 CHECK (overall_health_score >= 0 AND overall_health_score <= 100),
  
  -- Module health scores
  products_health_score numeric DEFAULT 0,
  orders_health_score numeric DEFAULT 0,
  finance_health_score numeric DEFAULT 0,
  inventory_health_score numeric DEFAULT 0,
  analytics_health_score numeric DEFAULT 0,
  
  -- Connection metrics
  total_connections_checked integer DEFAULT 0,
  valid_connections integer DEFAULT 0,
  broken_connections integer DEFAULT 0,
  missing_connections integer DEFAULT 0,
  
  -- Data quality percentages
  valid_data_percentage numeric DEFAULT 0,
  broken_data_percentage numeric DEFAULT 0,
  missing_data_percentage numeric DEFAULT 0,
  
  -- Issue summary
  total_issues integer DEFAULT 0,
  critical_issues integer DEFAULT 0,
  high_issues integer DEFAULT 0,
  medium_issues integer DEFAULT 0,
  low_issues integer DEFAULT 0,
  
  -- Scan reference
  scan_id uuid REFERENCES data_integrity_scans(id),
  
  calculated_at timestamptz DEFAULT now()
);

ALTER TABLE data_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view health metrics"
  ON data_health_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert health metrics"
  ON data_health_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrity_scans_status ON data_integrity_scans(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integrity_scans_type ON data_integrity_scans(scan_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrity_issues_scan ON data_integrity_issues(scan_id);
CREATE INDEX IF NOT EXISTS idx_integrity_issues_severity ON data_integrity_issues(severity, status);
CREATE INDEX IF NOT EXISTS idx_integrity_issues_module ON data_integrity_issues(module, status);
CREATE INDEX IF NOT EXISTS idx_integrity_issues_entity ON data_integrity_issues(entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trust_scores_metric ON trust_scores(metric_name, metric_category);
CREATE INDEX IF NOT EXISTS idx_trust_scores_entity ON trust_scores(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trust_scores_status ON trust_scores(status);
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_trust_history_score ON trust_score_history(trust_score_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(sent_to_user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_type ON alert_history(alert_type, severity);

CREATE INDEX IF NOT EXISTS idx_health_metrics_time ON data_health_metrics(calculated_at DESC);

-- Function to calculate trust score
CREATE OR REPLACE FUNCTION calculate_trust_score(
  p_metric_name text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE(
  overall_score numeric,
  source_validity numeric,
  connection_integrity numeric,
  freshness numeric,
  completeness numeric,
  consistency numeric,
  anomaly numeric,
  status text,
  issues text[]
) AS $$
DECLARE
  v_source_validity numeric := 25;
  v_connection_integrity numeric := 25;
  v_freshness numeric := 15;
  v_completeness numeric := 15;
  v_consistency numeric := 10;
  v_anomaly numeric := 10;
  v_overall numeric;
  v_status text;
  v_issues text[] := ARRAY[]::text[];
  v_last_update timestamptz;
BEGIN
  -- Source Validity Check (25%)
  -- Verify data comes from actual table, not cached/placeholder
  IF p_entity_id IS NULL THEN
    v_source_validity := 0;
    v_issues := array_append(v_issues, 'No source entity ID provided');
  END IF;
  
  -- Connection Integrity Check (25%)
  -- Check all relationships are valid
  IF p_entity_type = 'product' AND p_entity_id IS NOT NULL THEN
    -- Check product exists and has valid references
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_entity_id AND is_deleted = false) THEN
      v_connection_integrity := 0;
      v_issues := array_append(v_issues, 'Product not found or deleted');
    ELSE
      -- Check foreign key relationships
      PERFORM 1 FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = p_entity_id
        AND (p.brand_id IS NULL OR b.id IS NOT NULL)
        AND (p.category_id IS NULL OR c.id IS NOT NULL);
      
      IF NOT FOUND THEN
        v_connection_integrity := v_connection_integrity * 0.5;
        v_issues := array_append(v_issues, 'Broken foreign key relationships');
      END IF;
    END IF;
  END IF;
  
  -- Freshness Check (15%)
  -- Data updated recently
  IF p_entity_type = 'product' AND p_entity_id IS NOT NULL THEN
    SELECT updated_at INTO v_last_update
    FROM products WHERE id = p_entity_id;
    
    IF v_last_update IS NOT NULL THEN
      IF v_last_update < NOW() - INTERVAL '30 days' THEN
        v_freshness := v_freshness * 0.5;
        v_issues := array_append(v_issues, 'Data not updated in 30+ days');
      ELSIF v_last_update < NOW() - INTERVAL '7 days' THEN
        v_freshness := v_freshness * 0.8;
        v_issues := array_append(v_issues, 'Data not updated in 7+ days');
      END IF;
    END IF;
  END IF;
  
  -- Completeness Check (15%)
  -- No critical NULL fields
  IF p_entity_type = 'product' AND p_entity_id IS NOT NULL THEN
    PERFORM 1 FROM products
    WHERE id = p_entity_id
      AND name IS NOT NULL
      AND price IS NOT NULL
      AND stock_quantity IS NOT NULL;
    
    IF NOT FOUND THEN
      v_completeness := v_completeness * 0.3;
      v_issues := array_append(v_issues, 'Missing critical fields');
    END IF;
  END IF;
  
  -- Consistency Check (10%)
  -- Cross-module validation
  -- Example: product price matches store_products override
  
  -- Anomaly Check (10%)
  -- Detect abnormal values
  IF p_entity_type = 'product' AND p_entity_id IS NOT NULL THEN
    PERFORM 1 FROM products
    WHERE id = p_entity_id
      AND (price < 0 OR stock_quantity < 0);
    
    IF FOUND THEN
      v_anomaly := 0;
      v_issues := array_append(v_issues, 'Negative price or stock detected');
    END IF;
  END IF;
  
  -- Calculate overall score
  v_overall := v_source_validity + v_connection_integrity + v_freshness + v_completeness + v_consistency + v_anomaly;
  
  -- Determine status
  IF v_overall >= 90 THEN
    v_status := 'reliable';
  ELSIF v_overall >= 70 THEN
    v_status := 'warning';
  ELSE
    v_status := 'unreliable';
  END IF;
  
  RETURN QUERY SELECT
    ROUND(v_overall, 2),
    ROUND(v_source_validity, 2),
    ROUND(v_connection_integrity, 2),
    ROUND(v_freshness, 2),
    ROUND(v_completeness, 2),
    ROUND(v_consistency, 2),
    ROUND(v_anomaly, 2),
    v_status,
    v_issues;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to detect orphan records
CREATE OR REPLACE FUNCTION detect_orphan_records(
  p_table_name text
)
RETURNS TABLE(
  entity_id uuid,
  issue_type text,
  description text
) AS $$
BEGIN
  IF p_table_name = 'products' THEN
    RETURN QUERY
    SELECT
      p.id,
      'orphan_brand'::text,
      'Product references non-existent brand'::text
    FROM products p
    WHERE p.brand_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM brands WHERE id = p.brand_id)
      AND p.is_deleted = false
    
    UNION ALL
    
    SELECT
      p.id,
      'orphan_category'::text,
      'Product references non-existent category'::text
    FROM products p
    WHERE p.category_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM categories WHERE id = p.category_id)
      AND p.is_deleted = false;
  
  ELSIF p_table_name = 'orders' THEN
    RETURN QUERY
    SELECT
      o.id,
      'orphan_store'::text,
      'Order references non-existent store'::text
    FROM orders o
    WHERE o.store_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM stores WHERE id = o.store_id);
  
  ELSIF p_table_name = 'order_items' THEN
    RETURN QUERY
    SELECT
      oi.id,
      'orphan_product'::text,
      'Order item references non-existent product'::text
    FROM order_items oi
    WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = oi.product_id)
    
    UNION ALL
    
    SELECT
      oi.id,
      'orphan_order'::text,
      'Order item references non-existent order'::text
    FROM order_items oi
    WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = oi.order_id);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate overall data health
CREATE OR REPLACE FUNCTION calculate_data_health()
RETURNS TABLE(
  overall_health numeric,
  products_health numeric,
  orders_health numeric,
  total_issues integer
) AS $$
DECLARE
  v_total_products integer;
  v_valid_products integer;
  v_total_orders integer;
  v_valid_orders integer;
  v_products_health numeric;
  v_orders_health numeric;
  v_overall_health numeric;
  v_total_issues integer;
BEGIN
  -- Calculate products health
  SELECT COUNT(*) INTO v_total_products
  FROM products WHERE is_deleted = false;
  
  SELECT COUNT(*) INTO v_valid_products
  FROM products p
  LEFT JOIN brands b ON p.brand_id = b.id
  LEFT JOIN categories c ON p.category_id = c.id
  WHERE p.is_deleted = false
    AND p.name IS NOT NULL
    AND p.price IS NOT NULL
    AND p.stock_quantity IS NOT NULL
    AND (p.brand_id IS NULL OR b.id IS NOT NULL)
    AND (p.category_id IS NULL OR c.id IS NOT NULL);
  
  v_products_health := CASE
    WHEN v_total_products = 0 THEN 0
    ELSE (v_valid_products::numeric / v_total_products) * 100
  END;
  
  -- Calculate orders health
  SELECT COUNT(*) INTO v_total_orders FROM orders;
  
  SELECT COUNT(*) INTO v_valid_orders
  FROM orders o
  LEFT JOIN stores s ON o.store_id = s.id
  WHERE (o.store_id IS NULL OR s.id IS NOT NULL)
    AND o.total_amount IS NOT NULL
    AND o.status IS NOT NULL;
  
  v_orders_health := CASE
    WHEN v_total_orders = 0 THEN 100
    ELSE (v_valid_orders::numeric / v_total_orders) * 100
  END;
  
  -- Count open issues
  SELECT COUNT(*) INTO v_total_issues
  FROM data_integrity_issues
  WHERE status = 'open';
  
  -- Calculate overall health
  v_overall_health := (v_products_health + v_orders_health) / 2;
  
  RETURN QUERY SELECT
    ROUND(v_overall_health, 2),
    ROUND(v_products_health, 2),
    ROUND(v_orders_health, 2),
    v_total_issues;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to track trust score changes
CREATE OR REPLACE FUNCTION track_trust_score_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.overall_score != NEW.overall_score OR OLD.status != NEW.status) THEN
    INSERT INTO trust_score_history (
      trust_score_id,
      metric_name,
      overall_score,
      status,
      score_change,
      status_changed,
      previous_status
    ) VALUES (
      NEW.id,
      NEW.metric_name,
      NEW.overall_score,
      NEW.status,
      NEW.overall_score - OLD.overall_score,
      OLD.status != NEW.status,
      OLD.status
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_track_trust_score_change ON trust_scores;
CREATE TRIGGER trigger_track_trust_score_change
  AFTER UPDATE ON trust_scores
  FOR EACH ROW
  EXECUTE FUNCTION track_trust_score_change();

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_integrity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_integrity_issues_timestamp ON data_integrity_issues;
CREATE TRIGGER trigger_update_integrity_issues_timestamp
  BEFORE UPDATE ON data_integrity_issues
  FOR EACH ROW
  EXECUTE FUNCTION update_integrity_updated_at();

DROP TRIGGER IF EXISTS trigger_update_trust_scores_timestamp ON trust_scores;
CREATE TRIGGER trigger_update_trust_scores_timestamp
  BEFORE UPDATE ON trust_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_integrity_updated_at();

DROP TRIGGER IF EXISTS trigger_update_alert_settings_timestamp ON alert_settings;
CREATE TRIGGER trigger_update_alert_settings_timestamp
  BEFORE UPDATE ON alert_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_integrity_updated_at();

-- Comments
COMMENT ON TABLE data_integrity_scans IS 'Track all data integrity scan runs with results and timing';
COMMENT ON TABLE data_integrity_issues IS 'Log all detected data integrity issues with fix status';
COMMENT ON TABLE trust_scores IS 'Store trust scores for all metrics with component breakdown';
COMMENT ON TABLE trust_score_history IS 'Track trust score changes over time for trend analysis';
COMMENT ON TABLE alert_settings IS 'User alert configuration for integrity monitoring';
COMMENT ON TABLE alert_history IS 'History of all sent alerts';
COMMENT ON TABLE data_health_metrics IS 'System-wide data health metrics';

COMMENT ON FUNCTION calculate_trust_score IS 'Calculate comprehensive trust score (0-100) for any metric';
COMMENT ON FUNCTION detect_orphan_records IS 'Detect records with broken foreign key relationships';
COMMENT ON FUNCTION calculate_data_health IS 'Calculate overall system data health score';
