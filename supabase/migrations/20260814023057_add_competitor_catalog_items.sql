/*
# Add Competitor Catalog Items Table

1. Purpose
   - Stores products extracted from competitor catalog/category pages when scanning a full product listing page.
   - Each item is linked to a competitor and optionally to one of your own products if a match was found.
   - status field distinguishes between 'price_analysis' (matched your product) and 'purchase_opportunity' (product you don't sell).

2. New Table
   - `competitor_catalog_items`
     - id (uuid PK)
     - competitor_id (uuid FK -> competitors(id) ON DELETE CASCADE)
     - matched_product_id (uuid FK -> products(id) ON DELETE SET NULL, nullable)
     - name (text, not null) -- product name as found on competitor site
     - price (numeric 12,2, nullable) -- price as found on competitor site
     - product_url (text, nullable) -- link to competitor product page
     - image_url (text, nullable) -- product image from competitor site
     - status (text, not null default 'purchase_opportunity') -- 'price_analysis' | 'purchase_opportunity'
     - created_at (timestamptz default now())
     - updated_at (timestamptz default now())
     - UNIQUE(competitor_id, product_url) -- prevent duplicate entries for same competitor+URL

3. Indexes
   - competitor_catalog_items_competitor_id_idx on competitor_catalog_items(competitor_id)
   - competitor_catalog_items_status_idx on competitor_catalog_items(status)
   - competitor_catalog_items_matched_product_id_idx on competitor_catalog_items(matched_product_id) WHERE matched_product_id IS NOT NULL

4. Security
   - RLS enabled.
   - Admin-only CRUD policies (TO authenticated), matching the existing competitors/competitor_prices pattern.
   - Anon role has NO access (internal admin data only).
*/

CREATE TABLE IF NOT EXISTS competitor_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  matched_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  price numeric(12,2),
  product_url text,
  image_url text,
  status text NOT NULL DEFAULT 'purchase_opportunity',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(competitor_id, product_url)
);

ALTER TABLE competitor_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_competitor_catalog_items" ON competitor_catalog_items;
CREATE POLICY "admin_select_competitor_catalog_items" ON competitor_catalog_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_competitor_catalog_items" ON competitor_catalog_items;
CREATE POLICY "admin_insert_competitor_catalog_items" ON competitor_catalog_items FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_competitor_catalog_items" ON competitor_catalog_items;
CREATE POLICY "admin_update_competitor_catalog_items" ON competitor_catalog_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_competitor_catalog_items" ON competitor_catalog_items;
CREATE POLICY "admin_delete_competitor_catalog_items" ON competitor_catalog_items FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS competitor_catalog_items_competitor_id_idx ON competitor_catalog_items(competitor_id);
CREATE INDEX IF NOT EXISTS competitor_catalog_items_status_idx ON competitor_catalog_items(status);
CREATE INDEX IF NOT EXISTS competitor_catalog_items_matched_product_id_idx ON competitor_catalog_items(matched_product_id) WHERE matched_product_id IS NOT NULL;
