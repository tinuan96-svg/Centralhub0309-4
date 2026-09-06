/*
  # Fix mutable search_path on flagged functions
  
  Supabase security advisor flags functions whose search_path can be changed
  by the calling role. Setting search_path = public, extensions makes it
  immutable and prevents search_path injection attacks.
*/

ALTER FUNCTION public.track_product_slug_change()
  SET search_path = public, extensions;

ALTER FUNCTION public.resolve_product_slug(input_slug text)
  SET search_path = public, extensions;

ALTER FUNCTION public.api_keralagroceries_products(
  p_page integer, p_limit integer, p_search text, p_category text,
  p_brand text, p_status text, p_sort_by text, p_sort_order text
) SET search_path = public, extensions;

ALTER FUNCTION public.api_keralagroceries_grouped(
  p_limit_per_category integer, p_status text
) SET search_path = public, extensions;

ALTER FUNCTION public.enforce_store_gateway_match_on_paid_order()
  SET search_path = public, extensions;

ALTER FUNCTION public.api_keralagroceries_product_detail(
  p_id bigint, p_product_code text, p_status text
) SET search_path = public, extensions;

ALTER FUNCTION public.api_keralagroceries_filters(
  p_status text, p_distinct_limit integer
) SET search_path = public, extensions;

ALTER FUNCTION public.api_keralagroceries(
  p_mode text, p_page integer, p_limit integer, p_search text,
  p_category text, p_brand text, p_status text, p_sort_by text,
  p_sort_order text, p_limit_per_category integer, p_id bigint,
  p_product_code text
) SET search_path = public, extensions;

ALTER FUNCTION public.set_product_weight_unit_from_name()
  SET search_path = public, extensions;
