/*
  # Rebuild Multi-Store Product System

  ## What this does
  The previous migration created rule_stores/catalogue_products referencing the
  old pricing_rules table (which has a pricing_rule_type enum, not text). Those
  tables were empty so we drop them safely and rebuild with unambiguous names.

  ## Tables Created / Recreated

  ### ms_pricing_rules
  Stores how prices are marked up per store.
  - type: "percentage_markup" | "fixed_markup"
  - value: e.g. 30 = +30%, 5.00 = +£5.00 fixed

  ### ms_formatting_rules
  Stores how product names are cleaned/formatted per store.
  - type: "clean_name" | "uppercase" | "title_case" | "original"
  - remove_patterns: array of words to strip (e.g. ["STF", "Ltd"])

  ### ms_stock_rules
  Stores how stock quantities are presented per store.
  - type: "hide_below_threshold" | "buffer_stock" | "show_exact"
  - threshold: used by the first two types

  ### ms_stores
  One row per store. Each store references one rule of each type.

  ### ms_products
  Raw product data only. No markup, no formatting applied here.
  All transformation happens in the view.

  ## View Created

  ### store_products_view
  Dynamically applies pricing, formatting, and stock rules.
  Frontend queries: SELECT * FROM store_products_view WHERE rule_store_id = X

  ## Security
  RLS enabled on all tables. Authenticated users can CRUD everything.
  Anon role gets SELECT on the view for public storefronts.

  ## Seed Data
  - KG: +30% markup, clean_name+title_case, hide below 5
  - CentralHub: +10% markup, original name, show exact stock
*/

-- ─── Drop the empty tables from the previous attempt ─────────────────────────
DROP TABLE IF EXISTS catalogue_products CASCADE;
DROP TABLE IF EXISTS rule_stores CASCADE;
DROP TABLE IF EXISTS formatting_rules CASCADE;
DROP TABLE IF EXISTS stock_rules CASCADE;
-- Note: pricing_rules is the OLD system table (has enum), leave it alone.

-- ─── ms_pricing_rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_pricing_rules (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL,
  type       text    NOT NULL CHECK (type IN ('percentage_markup', 'fixed_markup')),
  value      numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz   DEFAULT now()
);

ALTER TABLE ms_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_pricing_rules select"
  ON ms_pricing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_pricing_rules insert"
  ON ms_pricing_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ms_pricing_rules update"
  ON ms_pricing_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ms_pricing_rules delete"
  ON ms_pricing_rules FOR DELETE TO authenticated USING (true);

-- ─── ms_formatting_rules ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_formatting_rules (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text    NOT NULL,
  type            text    NOT NULL CHECK (type IN ('clean_name', 'uppercase', 'title_case', 'original')),
  remove_patterns text[]  NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE ms_formatting_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_formatting_rules select"
  ON ms_formatting_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_formatting_rules insert"
  ON ms_formatting_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ms_formatting_rules update"
  ON ms_formatting_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ms_formatting_rules delete"
  ON ms_formatting_rules FOR DELETE TO authenticated USING (true);

-- ─── ms_stock_rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_stock_rules (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text    NOT NULL,
  type        text    NOT NULL CHECK (type IN ('hide_below_threshold', 'buffer_stock', 'show_exact')),
  threshold   integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE ms_stock_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_stock_rules select"
  ON ms_stock_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_stock_rules insert"
  ON ms_stock_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ms_stock_rules update"
  ON ms_stock_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ms_stock_rules delete"
  ON ms_stock_rules FOR DELETE TO authenticated USING (true);

-- ─── ms_stores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_stores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  pricing_rule_id     uuid NOT NULL REFERENCES ms_pricing_rules(id)    ON DELETE RESTRICT,
  formatting_rule_id  uuid NOT NULL REFERENCES ms_formatting_rules(id) ON DELETE RESTRICT,
  stock_rule_id       uuid NOT NULL REFERENCES ms_stock_rules(id)      ON DELETE RESTRICT,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE ms_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_stores select"
  ON ms_stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_stores insert"
  ON ms_stores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ms_stores update"
  ON ms_stores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ms_stores delete"
  ON ms_stores FOR DELETE TO authenticated USING (true);

-- ─── ms_products ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_products (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  ms_store_id   uuid    NOT NULL REFERENCES ms_stores(id) ON DELETE CASCADE,
  raw_name      text    NOT NULL,
  base_price    numeric(10,4) NOT NULL CHECK (base_price >= 0),
  raw_stock     integer NOT NULL DEFAULT 0 CHECK (raw_stock >= 0),
  category      text    NOT NULL DEFAULT '',
  image_url     text    NOT NULL DEFAULT '',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ms_products_store  ON ms_products(ms_store_id);
CREATE INDEX IF NOT EXISTS idx_ms_products_active ON ms_products(is_active);

ALTER TABLE ms_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_products select"
  ON ms_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_products insert"
  ON ms_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ms_products update"
  ON ms_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ms_products delete"
  ON ms_products FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION ms_products_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ms_products_updated_at
  BEFORE UPDATE ON ms_products
  FOR EACH ROW EXECUTE FUNCTION ms_products_set_updated_at();

-- ─── store_products_view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW store_products_view AS
SELECT
  p.id,
  p.ms_store_id                                              AS rule_store_id,
  s.name                                                     AS store_name,

  -- Formatting
  CASE
    WHEN fr.type = 'clean_name' THEN
      CASE
        WHEN array_length(fr.remove_patterns, 1) > 0 THEN
          initcap(trim(regexp_replace(
            p.raw_name,
            '(?i)\m(' || array_to_string(fr.remove_patterns, '|') || ')\M\s*',
            '', 'g'
          )))
        ELSE initcap(p.raw_name)
      END
    WHEN fr.type = 'uppercase'   THEN upper(p.raw_name)
    WHEN fr.type = 'title_case'  THEN initcap(p.raw_name)
    ELSE p.raw_name
  END                                                        AS final_name,

  -- Pricing
  ROUND(
    CASE
      WHEN pr.type = 'percentage_markup' THEN p.base_price + (p.base_price * pr.value / 100)
      WHEN pr.type = 'fixed_markup'      THEN p.base_price + pr.value
      ELSE p.base_price
    END, 2
  )                                                          AS final_price,

  -- Stock
  CASE
    WHEN sr.type = 'hide_below_threshold' THEN
      CASE WHEN p.raw_stock < sr.threshold THEN 0 ELSE p.raw_stock END
    WHEN sr.type = 'buffer_stock' THEN
      GREATEST(0, p.raw_stock - sr.threshold)
    ELSE p.raw_stock
  END                                                        AS final_stock,

  p.category,
  p.image_url,
  p.is_active

FROM ms_products         p
JOIN ms_stores           s  ON s.id  = p.ms_store_id
JOIN ms_pricing_rules    pr ON pr.id = s.pricing_rule_id
JOIN ms_formatting_rules fr ON fr.id = s.formatting_rule_id
JOIN ms_stock_rules      sr ON sr.id = s.stock_rule_id

WHERE p.is_active = true
  AND s.is_active = true;

GRANT SELECT ON store_products_view TO authenticated;
GRANT SELECT ON store_products_view TO anon;

-- ─── Seed Data ───────────────────────────────────────────────────────────────

-- Pricing rules
INSERT INTO ms_pricing_rules (id, name, type, value) VALUES
  ('00000001-0000-0000-0000-000000000001', 'KG Markup 30%',        'percentage_markup', 30),
  ('00000001-0000-0000-0000-000000000002', 'CentralHub Markup 10%', 'percentage_markup', 10);

-- Formatting rules
INSERT INTO ms_formatting_rules (id, name, type, remove_patterns) VALUES
  ('00000002-0000-0000-0000-000000000001', 'KG Clean Title Case', 'clean_name', ARRAY['STF','Ltd','Pvt','PVT','LTD']),
  ('00000002-0000-0000-0000-000000000002', 'CentralHub Original', 'original',   ARRAY[]::text[]);

-- Stock rules
INSERT INTO ms_stock_rules (id, name, type, threshold) VALUES
  ('00000003-0000-0000-0000-000000000001', 'KG Hide Below 5',    'hide_below_threshold', 5),
  ('00000003-0000-0000-0000-000000000002', 'CentralHub Exact',   'show_exact',            0);

-- Stores
INSERT INTO ms_stores (id, name, pricing_rule_id, formatting_rule_id, stock_rule_id) VALUES
  ('00000004-0000-0000-0000-000000000001', 'KG',
   '00000001-0000-0000-0000-000000000001',
   '00000002-0000-0000-0000-000000000001',
   '00000003-0000-0000-0000-000000000001'),
  ('00000004-0000-0000-0000-000000000002', 'CentralHub',
   '00000001-0000-0000-0000-000000000002',
   '00000002-0000-0000-0000-000000000002',
   '00000003-0000-0000-0000-000000000002');

-- Sample products (raw data)
INSERT INTO ms_products (ms_store_id, raw_name, base_price, raw_stock, category) VALUES
  ('00000004-0000-0000-0000-000000000001', 'STF Basmati Rice 5kg Pvt',  8.00,  20, 'Rice'),
  ('00000004-0000-0000-0000-000000000001', 'coconut oil Ltd 500ml',     4.50,   3, 'Oils'),
  ('00000004-0000-0000-0000-000000000001', 'kerala mixture STF 400g',   2.00,  15, 'Snacks'),
  ('00000004-0000-0000-0000-000000000002', 'STF Basmati Rice 5kg',     8.00,  20, 'Rice'),
  ('00000004-0000-0000-0000-000000000002', 'Coconut Oil 500ml',         4.50,   3, 'Oils'),
  ('00000004-0000-0000-0000-000000000002', 'Kerala Mixture 400g',       2.00,  15, 'Snacks');
