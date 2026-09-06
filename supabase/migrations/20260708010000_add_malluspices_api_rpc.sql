-- ============================================================
-- MALLUSPICES API RPC
-- Creates KeralaGrocery-style API functions for MalluSpices
-- ============================================================

-- Function to get products for the MalluSpices website
CREATE OR REPLACE FUNCTION public.api_malluspices_products(
  p_category_name text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  product_title text,
  product_display_name text,
  product_code text,
  price numeric,
  qnty integer,
  brand text,
  category_name text,
  unit text,
  weight numeric,
  parent text,
  qnty_deducted integer,
  adjusted_qnty integer,
  price_added_percent numeric,
  price_added_amount numeric,
  adjusted_price numeric,
  product_description text,
  image_url text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.product_id,
    m.product_title,
    m.product_display_name,
    m.product_code,
    m.price,
    m.qnty,
    m.brand,
    m.category_name,
    m.unit,
    m.weight,
    m.parent,
    m.qnty_deducted,
    m.adjusted_qnty,
    m.price_added_percent,
    m.price_added_amount,
    m.adjusted_price,
    m.product_description,
    p.image_url,
    m.status
  FROM public.malluspices m
  JOIN public.products p ON p.id = m.product_id
  WHERE m.status = 'active'
    AND (p_category_name IS NULL OR m.category_name = p_category_name OR m.mapped_category_name = p_category_name)
    AND (p_search IS NULL OR m.product_display_name ILIKE '%' || p_search || '%' OR m.product_code ILIKE '%' || p_search || '%')
  ORDER BY m.product_display_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant access to the API function
GRANT EXECUTE ON FUNCTION public.api_malluspices_products(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.api_malluspices_products(text, text, integer, integer) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.api_malluspices_products IS 'Official API for MalluSpices website to fetch rule-applied products (Staging-aware)';
