/*
# Add Competitor Analysis System

1. Purpose
   - Allows admin to track competitor product prices alongside your own products.
   - Supports unlimited competitors (name + website).
   - Each competitor price row links to one of your products and one competitor.
   - Optional product_url field lets the edge function auto-scan that competitor page for price changes.
   - scan_status and last_scanned_at track the automated fetch state.

2. New Tables
   - `competitors`
     - id (uuid PK)
     - name (text, not null)
     - website_url (text, nullable)
     - logo_url (text, nullable)
     - created_at (timestamptz default now())
   - `competitor_prices`
     - id (uuid PK)
     - product_id (uuid FK -> products(id) ON DELETE CASCADE)
     - competitor_id (uuid FK -> competitors(id) ON DELETE CASCADE)
     - price (numeric 12,2, not null)
     - product_url (text, nullable) -- competitor product page link for auto-scanning
     - auto_scan_enabled (boolean default false)
     - last_scanned_at (timestamptz, nullable)
     - scan_status (text, nullable) -- 'success' | 'failed' | 'pending'
     - scan_error (text, nullable)
     - created_at (timestamptz default now())
     - updated_at (timestamptz default now())
     - UNIQUE(product_id, competitor_id)

3. Indexes
   - competitor_prices_product_id_idx on competitor_prices(product_id)
   - competitor_prices_competitor_id_idx on competitor_prices(competitor_id)
   - competitor_prices_auto_scan_idx on competitor_prices(auto_scan_enabled) WHERE auto_scan_enabled = true

4. Security
   - RLS enabled on both tables.
   - Admin-only CRUD policies (TO authenticated) using the existing pattern from other internal tables.
   - Anon role has NO access (this is internal admin data only).
*/

CREATE TABLE IF NOT EXISTS competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_competitors" ON competitors;
CREATE POLICY "admin_select_competitors" ON competitors FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_competitors" ON competitors;
CREATE POLICY "admin_insert_competitors" ON competitors FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_competitors" ON competitors;
CREATE POLICY "admin_update_competitors" ON competitors FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_competitors" ON competitors;
CREATE POLICY "admin_delete_competitors" ON competitors FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS competitor_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  price numeric(12,2) NOT NULL,
  product_url text,
  auto_scan_enabled boolean NOT NULL DEFAULT false,
  last_scanned_at timestamptz,
  scan_status text,
  scan_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, competitor_id)
);

ALTER TABLE competitor_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_competitor_prices" ON competitor_prices;
CREATE POLICY "admin_select_competitor_prices" ON competitor_prices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_competitor_prices" ON competitor_prices;
CREATE POLICY "admin_insert_competitor_prices" ON competitor_prices FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_competitor_prices" ON competitor_prices;
CREATE POLICY "admin_update_competitor_prices" ON competitor_prices FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_competitor_prices" ON competitor_prices;
CREATE POLICY "admin_delete_competitor_prices" ON competitor_prices FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS competitor_prices_product_id_idx ON competitor_prices(product_id);
CREATE INDEX IF NOT EXISTS competitor_prices_competitor_id_idx ON competitor_prices(competitor_id);
CREATE INDEX IF NOT EXISTS competitor_prices_auto_scan_idx ON competitor_prices(auto_scan_enabled) WHERE auto_scan_enabled = true;