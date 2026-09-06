/*
  # Add SEO Title System

  1. Changes
    - Add `seo_title` column to `products` table for base SEO titles
    - Add `seo_title_override` column to `store_products` table for store-specific SEO titles
    - Both columns are nullable and have a 60 character limit to comply with SEO best practices
    
  2. Purpose
    - Enable automatic SEO title generation in format: "Buy {Product Name} Online in UK | Kerala Grocery"
    - Support store-specific SEO title overrides
    - Enforce 60 character limit for optimal search engine display
    
  3. Notes
    - SEO titles will be auto-generated when products are created/updated
    - Store overrides allow localized SEO optimization per store
    - Character limit ensures titles display properly in search results
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'seo_title'
  ) THEN
    ALTER TABLE products ADD COLUMN seo_title text;
    ALTER TABLE products ADD CONSTRAINT products_seo_title_length CHECK (char_length(seo_title) <= 60);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_products' AND column_name = 'seo_title_override'
  ) THEN
    ALTER TABLE store_products ADD COLUMN seo_title_override text;
    ALTER TABLE store_products ADD CONSTRAINT store_products_seo_title_length CHECK (char_length(seo_title_override) <= 60);
  END IF;
END $$;
