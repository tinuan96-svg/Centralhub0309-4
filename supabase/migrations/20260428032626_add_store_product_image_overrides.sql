/*
  # Store Product Image Overrides

  ## Summary
  Adds dedicated per-store image override support so each store can display
  different images for the same product independently of the central product record.

  ## Changes

  ### Modified Tables
  - `store_products`: Ensures `image_override` (single primary image) and
    `gallery_images_override` (ordered gallery array) columns exist.
    These already exist from previous migrations but we guard with IF NOT EXISTS.

  ### New Tables
  - `media_product_mappings`: Records which central product a media file is
    mapped to (used by the Media Library UI). Lightweight — just filename + product_id.

  ## Security
  - RLS enabled on new table
  - Authenticated users (admins) can read/write mappings
*/

-- Ensure image_override exists on store_products (may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_products' AND column_name = 'image_override'
  ) THEN
    ALTER TABLE store_products ADD COLUMN image_override text;
  END IF;
END $$;

-- Ensure gallery_images_override exists on store_products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_products' AND column_name = 'gallery_images_override'
  ) THEN
    ALTER TABLE store_products ADD COLUMN gallery_images_override text[];
  END IF;
END $$;

-- Media <-> Product mapping table (central, not per-store)
CREATE TABLE IF NOT EXISTS media_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(filename, product_id)
);

CREATE INDEX IF NOT EXISTS idx_media_product_mappings_product ON media_product_mappings(product_id);
CREATE INDEX IF NOT EXISTS idx_media_product_mappings_filename ON media_product_mappings(filename);

ALTER TABLE media_product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view media mappings"
  ON media_product_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert media mappings"
  ON media_product_mappings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update media mappings"
  ON media_product_mappings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete media mappings"
  ON media_product_mappings FOR DELETE
  TO authenticated
  USING (true);
