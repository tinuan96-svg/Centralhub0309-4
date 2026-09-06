/*
# Add data_source and AI-assisted extraction setting

1. Purpose
   - Track the origin of competitor data (scan, ai_scan, manual, import)
   - Persist the AI-assisted extraction toggle in pricing_settings

2. Changes
   - competitor_prices: add `data_source` text column (default 'scan')
   - competitor_catalog_items: add `data_source` text column (default 'scan')
   - pricing_settings: add `ai_assisted_extraction` boolean (default true)

3. Security
   No new tables. RLS already exists. No policy changes needed.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitor_prices' AND column_name='data_source') THEN
    ALTER TABLE competitor_prices ADD COLUMN data_source text NOT NULL DEFAULT 'scan';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitor_catalog_items' AND column_name='data_source') THEN
    ALTER TABLE competitor_catalog_items ADD COLUMN data_source text NOT NULL DEFAULT 'scan';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pricing_settings' AND column_name='ai_assisted_extraction') THEN
    ALTER TABLE pricing_settings ADD COLUMN ai_assisted_extraction boolean NOT NULL DEFAULT true;
  END IF;
END $$;
