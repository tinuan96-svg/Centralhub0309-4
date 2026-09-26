-- CentralHub production incident repair, 26 Sep 2026.
-- Keep competitor match, eligibility and automated pricing decisions unchanged.
-- Only refresh rows whose computed quality status has changed, using an explicit WHERE clause.
-- Fixes repeated SQLSTATE 21000 ("UPDATE requires a WHERE clause") from the existing RPC.
CREATE OR REPLACE FUNCTION public.refresh_competitor_data_quality()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH quality AS (
    SELECT cp.id, CASE
    WHEN cp.scan_status = 'failed' THEN 'FAILED'
    WHEN cp.scan_status = 'review_required' THEN 'REVIEW_REQUIRED'
    WHEN cp.match_status NOT IN ('automatic','manual') OR cp.match_status IS NULL THEN 'PENDING_MATCH'
    WHEN COALESCE(cp.match_confidence,0) < 0.80 THEN 'INVALID_MATCH'
    WHEN lower(COALESCE(cp.source_stock_status,'unknown')) IN ('out of stock','out_of_stock','outofstock','out-of-stock','unavailable','sold out','sold_out') THEN 'OUT_OF_STOCK'
    WHEN lower(trim(COALESCE(cp.source_stock_status,'unknown'))) NOT IN ('in_stock','in stock','instock','in-stock','available') THEN 'STOCK_UNKNOWN'
    WHEN COALESCE(cp.source_sale_price,0) > 0 THEN 'PROMOTIONAL'
    WHEN COALESCE(cp.is_conditional,false) THEN 'CONDITIONAL'
    WHEN cp.normalisation_status <> 'NORMALIZED' THEN 'UNNORMALIZED'
    WHEN cp.source_unit_type IN ('pack','pcs') AND COALESCE(cp.source_unit_value,0) > 1 AND cp.product_measurement_match IS NOT TRUE THEN 'MULTIPACK_REVIEW'
    WHEN cp.product_measurement_match IS NOT TRUE THEN 'SIZE_MISMATCH'
    WHEN cp.authoritative_eligible = false THEN 'INVALID_MATCH'
    WHEN cp.last_scanned_at IS NULL THEN 'NO_DATA'
    WHEN cp.last_scanned_at >= now() - interval '24 hours' THEN 'FRESH'
    WHEN cp.last_scanned_at >= now() - interval '48 hours' THEN 'AGING'
    ELSE 'STALE'
  END AS next_state
    FROM public.competitor_prices cp
  )
  UPDATE public.competitor_prices cp
  SET data_quality_state = quality.next_state
  FROM quality
  WHERE cp.id = quality.id
    AND cp.data_quality_state IS DISTINCT FROM quality.next_state;
END;
$function$

