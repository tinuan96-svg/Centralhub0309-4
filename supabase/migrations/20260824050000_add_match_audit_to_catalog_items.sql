-- Add audit fields to competitor_catalog_items for higher precision matching tracking
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS match_method text;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS brand_match boolean;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS size_match boolean;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS product_type_match boolean;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS ai_used boolean DEFAULT false;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS ai_model text;
ALTER TABLE public.competitor_catalog_items ADD COLUMN IF NOT EXISTS matched_at timestamptz;

-- Also add to competitor_prices for live tracking
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS match_method text;
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS brand_match boolean;
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS size_match boolean;
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS product_type_match boolean;
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS ai_used boolean DEFAULT false;
ALTER TABLE public.competitor_prices ADD COLUMN IF NOT EXISTS ai_model text;

-- RECONCILIATION: Invalidate weak or suspicious existing matches
-- We mark them as review_required and unlink the product to be safe.
-- This forces a re-scan or manual review with the new strict rules.
UPDATE public.competitor_catalog_items
SET
  match_status = 'review_required',
  matched_product_id = NULL,
  status = 'purchase_opportunity',
  match_reasons = array_append(COALESCE(match_reasons, '{}'), 'Invalidated by strict matching engine upgrade')
WHERE
  matched_product_id IS NOT NULL
  AND (
    confidence_score < 80
    OR confidence_score IS NULL
    OR match_method IS NULL
  );

-- Force reload schema
NOTIFY pgrst, 'reload schema';
