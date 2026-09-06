/*
# Fix Competitor Intelligence Infrastructure

## Purpose
Create the missing database tables and columns that the existing competitor-price-scanner
edge function and competitorService already reference but that do not exist in the live database.

## New Tables

### 1. competitor_audit_logs
- Stores audit entries for every scan action (success, failure, price change, etc.)
- The scanner's logAudit() function already inserts into this table.
- Columns: id, competitor_price_id, action, details (jsonb), created_at

### 2. competitor_discovery_sessions
- Tracks catalogue discovery progress per competitor.
- The scanner's discoverCatalog() function already updates this table.
- Columns: id, competitor_id, status, method, progress (jsonb), started_at, completed_at

## Modified Tables

### competitors (add 3 columns)
- discovery_status text DEFAULT 'not_scanned' — tracks discovery state
- discovery_progress jsonb — stores discovery statistics
- last_discovery_at timestamptz — when discovery last ran

### competitor_catalog_items (add 11 columns)
- source_brand text — brand extracted from competitor page
- source_sku text — SKU from competitor page
- source_gtin text — barcode/GTIN from competitor page
- source_size text — size from competitor page
- source_unit text — unit from competitor page
- source_currency text — currency from competitor page
- source_regular_price numeric — regular/RRP price
- source_sale_price numeric — sale price
- source_availability text — stock status
- source_image_url text — product image URL
- last_scanned_at timestamptz — when this item was last scanned

## Security
- RLS enabled on both new tables.
- Policies: authenticated role gets full CRUD (admin tool).
- No USING(true) — all policies scoped to authenticated role.
- No secrets exposed.

## Important Notes
1. All CREATE TABLE / ALTER TABLE statements use IF NOT EXISTS for idempotency.
2. Existing data is preserved — only new columns/tables are added.
3. No existing columns are dropped or renamed.
4. No store pricing tables are touched.
5. No CentralHub product prices are changed.
*/

-- ============================================================
-- 1. CREATE competitor_audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_price_id uuid REFERENCES competitor_prices(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE competitor_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_competitor_audit_logs" ON competitor_audit_logs;
CREATE POLICY "auth_select_competitor_audit_logs"
ON competitor_audit_logs FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_competitor_audit_logs" ON competitor_audit_logs;
CREATE POLICY "auth_insert_competitor_audit_logs"
ON competitor_audit_logs FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_competitor_audit_logs" ON competitor_audit_logs;
CREATE POLICY "auth_update_competitor_audit_logs"
ON competitor_audit_logs FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_competitor_audit_logs" ON competitor_audit_logs;
CREATE POLICY "auth_delete_competitor_audit_logs"
ON competitor_audit_logs FOR DELETE
TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_competitor_audit_logs_price_id ON competitor_audit_logs(competitor_price_id);
CREATE INDEX IF NOT EXISTS idx_competitor_audit_logs_created_at ON competitor_audit_logs(created_at DESC);

-- ============================================================
-- 2. CREATE competitor_discovery_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_discovery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  method text,
  progress jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE competitor_discovery_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_competitor_discovery_sessions" ON competitor_discovery_sessions;
CREATE POLICY "auth_select_competitor_discovery_sessions"
ON competitor_discovery_sessions FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_competitor_discovery_sessions" ON competitor_discovery_sessions;
CREATE POLICY "auth_insert_competitor_discovery_sessions"
ON competitor_discovery_sessions FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_competitor_discovery_sessions" ON competitor_discovery_sessions;
CREATE POLICY "auth_update_competitor_discovery_sessions"
ON competitor_discovery_sessions FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_competitor_discovery_sessions" ON competitor_discovery_sessions;
CREATE POLICY "auth_delete_competitor_discovery_sessions"
ON competitor_discovery_sessions FOR DELETE
TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_competitor_id ON competitor_discovery_sessions(competitor_id);
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status ON competitor_discovery_sessions(status);

-- ============================================================
-- 3. ADD COLUMNS TO competitors
-- ============================================================
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS discovery_status text DEFAULT 'not_scanned';
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS discovery_progress jsonb;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS last_discovery_at timestamptz;

-- ============================================================
-- 4. ADD COLUMNS TO competitor_catalog_items
-- ============================================================
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_brand text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_sku text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_gtin text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_size text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_unit text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_currency text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_regular_price numeric;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_sale_price numeric;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_availability text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS source_image_url text;
ALTER TABLE competitor_catalog_items ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz;

-- ============================================================
-- 5. GRANT access
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON competitor_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON competitor_discovery_sessions TO authenticated;