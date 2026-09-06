/*
  # Add gallery_images to products and store_products

  1. Changes
    - `products`: adds `gallery_images text[]` — ordered array of public image URLs
      The first element is treated as the primary image; `image_url` keeps working as the
      legacy single-image field.
    - `store_products`: adds `gallery_images_override text[]` — per-store gallery override.
      When NULL the store inherits the base product's gallery.

  2. Notes
    - Non-destructive: both columns default to NULL (no data loss).
    - RLS unchanged; existing policies already cover these columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'gallery_images'
  ) THEN
    ALTER TABLE products ADD COLUMN gallery_images text[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_products' AND column_name = 'gallery_images_override'
  ) THEN
    ALTER TABLE store_products ADD COLUMN gallery_images_override text[];
  END IF;
END $$;
