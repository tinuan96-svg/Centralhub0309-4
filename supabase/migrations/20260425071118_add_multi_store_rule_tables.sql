/*
  # Multi-Store Rule Tables

  ## Purpose
  Adds the rule tables that power per-store product transformations.
  Existing products/stores tables are not dropped — new tables are additive.

  ## New Tables

  ### `pricing_rules`
  - `id` (uuid, primary key)
  - `name` (text) — human label for the rule
  - `type` (text) — "percentage_markup" | "fixed_markup"
  - `value` (numeric) — e.g. 30 = +30%, 5.00 = +£5.00 fixed

  ### `formatting_rules`
  - `id` (uuid, primary key)
  - `name` (text) — human label
  - `type` (text) — "clean_name" | "uppercase" | "title_case" | "original"
  - `remove_patterns` (text[]) — words to strip from raw_name

  ### `stock_rules`
  - `id` (uuid, primary key)
  - `name` (text) — human label
  - `type` (text) — "hide_below_threshold" | "buffer_stock" | "show_exact"
  - `threshold` (integer) — used by hide_below_threshold and buffer_stock

  ### `rule_stores` (the new multi-store catalogue stores)
  - `id` (uuid, primary key)
  - `name` (text) — e.g. "KG", "CentralHub"
  - `pricing_rule_id` (uuid, FK)
  - `formatting_rule_id` (uuid, FK)
  - `stock_rule_id` (uuid, FK)
  - `is_active` (boolean, default true)

  ### `catalogue_products` (raw product data, store-scoped)
  - `id` (uuid, primary key)
  - `rule_store_id` (uuid, FK to rule_stores)
  - `raw_name` (text)
  - `base_price` (numeric)
  - `raw_stock` (integer)
  - `category` (text)
  - `image_url` (text)
  - `is_active` (boolean, default true)

  ## Security
  - RLS enabled on all new tables
  - Authenticated users (admins) can read/write all rows
  - Public can read rule_stores and store_products_view

  ## Performance
  - Indexes on catalogue_products.rule_store_id and is_active
*/

-- ─── pricing_rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('percentage_markup', 'fixed_markup')),
  value       numeric(10, 4) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pricing rules"
  ON pricing_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert pricing rules"
  ON pricing_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update pricing rules"
  ON pricing_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete pricing rules"
  ON pricing_rules FOR DELETE
  TO authenticated
  USING (true);

-- ─── formatting_rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formatting_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('clean_name', 'uppercase', 'title_case', 'original')),
  remove_patterns text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE formatting_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage formatting rules"
  ON formatting_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert formatting rules"
  ON formatting_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update formatting rules"
  ON formatting_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete formatting rules"
  ON formatting_rules FOR DELETE
  TO authenticated
  USING (true);

-- ─── stock_rules ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('hide_below_threshold', 'buffer_stock', 'show_exact')),
  threshold   integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE stock_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stock rules"
  ON stock_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert stock rules"
  ON stock_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update stock rules"
  ON stock_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete stock rules"
  ON stock_rules FOR DELETE
  TO authenticated
  USING (true);

-- ─── rule_stores ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rule_stores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  pricing_rule_id     uuid NOT NULL REFERENCES pricing_rules(id) ON DELETE RESTRICT,
  formatting_rule_id  uuid NOT NULL REFERENCES formatting_rules(id) ON DELETE RESTRICT,
  stock_rule_id       uuid NOT NULL REFERENCES stock_rules(id) ON DELETE RESTRICT,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE rule_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rule stores"
  ON rule_stores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert rule stores"
  ON rule_stores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update rule stores"
  ON rule_stores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete rule stores"
  ON rule_stores FOR DELETE
  TO authenticated
  USING (true);

-- ─── catalogue_products ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogue_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_store_id   uuid NOT NULL REFERENCES rule_stores(id) ON DELETE CASCADE,
  raw_name        text NOT NULL,
  base_price      numeric(10, 4) NOT NULL CHECK (base_price >= 0),
  raw_stock       integer NOT NULL DEFAULT 0 CHECK (raw_stock >= 0),
  category        text NOT NULL DEFAULT '',
  image_url       text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_products_store   ON catalogue_products(rule_store_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_products_active  ON catalogue_products(is_active);

ALTER TABLE catalogue_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage catalogue products"
  ON catalogue_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert catalogue products"
  ON catalogue_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update catalogue products"
  ON catalogue_products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete catalogue products"
  ON catalogue_products FOR DELETE
  TO authenticated
  USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_catalogue_products_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalogue_products_updated_at
  BEFORE UPDATE ON catalogue_products
  FOR EACH ROW EXECUTE FUNCTION update_catalogue_products_updated_at();
