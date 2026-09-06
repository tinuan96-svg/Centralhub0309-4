-- migration: 20260819000001_competitor_analysis_v2_migration.sql
-- Description: Intelligent Competitor Analysis Upgrade - Step 1: Database Schema

-- ============================================================
-- 1. ENHANCE competitor_prices TABLE
-- ============================================================
DO $$
BEGIN
    -- Match Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'match_confidence') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN match_confidence numeric(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'match_status') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN match_status text DEFAULT 'pending' CHECK (match_status IN ('automatic', 'manual', 'pending', 'review_required'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'extraction_status') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN extraction_status text DEFAULT 'pending';
    END IF;

    -- Scanning Schedule
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'scan_frequency') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN scan_frequency interval DEFAULT '24 hours';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'next_scan_at') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN next_scan_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'last_successful_scan_at') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN last_successful_scan_at timestamptz;
    END IF;

    -- Source Metadata (Snapshot of data as found on competitor site)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_product_name') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_product_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_brand') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_brand text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_sku') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_sku text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_gtin') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_gtin text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_currency') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_currency text DEFAULT 'GBP';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_regular_price') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_regular_price numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_sale_price') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_sale_price numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_stock_status') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_stock_status text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_size') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_size text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_variant') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_variant text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_image_url') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_image_url text;
    END IF;

END $$;

-- Backfill defaults for existing records
UPDATE public.competitor_prices
SET next_scan_at = now() + (interval '1 hour' * (floor(random() * 24))),
    match_status = 'manual',
    extraction_status = 'completed'
WHERE next_scan_at IS NULL;

-- ============================================================
-- 2. CREATE PRICE HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_price_id uuid NOT NULL REFERENCES public.competitor_prices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_price numeric(12,2),
  new_price numeric(12,2) NOT NULL,
  currency text DEFAULT 'GBP',
  percentage_change numeric(10,2),
  detected_at timestamptz DEFAULT now(),
  scan_id uuid,
  source_price_type text -- 'regular' | 'sale'
);

-- ============================================================
-- 3. CREATE AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES public.competitors(id) ON DELETE CASCADE,
  competitor_price_id uuid REFERENCES public.competitor_prices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. ENHANCE competitor_catalog_items
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'match_reasons') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN match_reasons text[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'confidence_score') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN confidence_score numeric(5,2);
    END IF;
END $$;

-- ============================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_competitor_prices_next_scan ON public.competitor_prices(next_scan_at) WHERE auto_scan_enabled = true;
CREATE INDEX IF NOT EXISTS idx_competitor_prices_match_status ON public.competitor_prices(match_status);
CREATE INDEX IF NOT EXISTS idx_competitor_price_history_price_id ON public.competitor_price_history(competitor_price_id);
CREATE INDEX IF NOT EXISTS idx_competitor_price_history_detected ON public.competitor_price_history(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_audit_competitor ON public.competitor_audit_logs(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_audit_price ON public.competitor_audit_logs(competitor_price_id);
CREATE INDEX IF NOT EXISTS idx_competitor_audit_created ON public.competitor_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_catalog_items_matched_prod ON public.competitor_catalog_items(matched_product_id);

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================
ALTER TABLE public.competitor_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_audit_logs ENABLE ROW LEVEL SECURITY;

-- Standard Admin policies for new tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competitor_price_history' AND policyname = 'admin_manage_history') THEN
        CREATE POLICY "admin_manage_history" ON public.competitor_price_history FOR ALL TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competitor_audit_logs' AND policyname = 'admin_manage_audit') THEN
        CREATE POLICY "admin_manage_audit" ON public.competitor_audit_logs FOR ALL TO authenticated USING (true);
    END IF;
END $$;

COMMENT ON TABLE public.competitor_price_history IS 'Stores every historical price change detected during scans.';
COMMENT ON TABLE public.competitor_audit_logs IS 'Audit trail for all competitor analysis actions (system and manual).';
