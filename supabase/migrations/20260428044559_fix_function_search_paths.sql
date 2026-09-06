/*
  # Fix Function Search Path Mutable

  Sets a fixed search_path on all functions flagged as having a mutable search_path.
  A mutable search_path is a security risk because a malicious user could create
  objects in a schema earlier in the path to intercept function calls.

  Functions fixed:
  - get_store_header
  - get_store_categories_with_counts
  - get_store_products
  - pocketgrocery_get_store_header
  - pocketgrocery_get_store_categories_with_counts
  - pocketgrocery_get_store_page_data
  - pocketgrocery_get_store_page_data_light
  - pocketgrocery_get_store_products
  - pocketgrocery_get_store_product_detail
*/

ALTER FUNCTION public.get_store_header(p_store_slug text) SET search_path = public;
ALTER FUNCTION public.get_store_categories_with_counts(p_store_slug text) SET search_path = public;
ALTER FUNCTION public.get_store_products(p_store_slug text, p_search text, p_main_category_id uuid, p_min_price numeric, p_max_price numeric, p_in_stock_only boolean, p_sort text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_header(p_store_slug text) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_categories_with_counts(p_store_slug text) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_page_data(p_store_slug text, p_search text, p_main_category_id uuid, p_min_price numeric, p_max_price numeric, p_in_stock_only boolean, p_sort text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_page_data_light(p_store_slug text, p_search text, p_main_category_id uuid, p_min_price numeric, p_max_price numeric, p_in_stock_only boolean, p_sort text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_products(p_store_slug text, p_search text, p_main_category_id uuid, p_min_price numeric, p_max_price numeric, p_in_stock_only boolean, p_sort text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.pocketgrocery_get_store_product_detail(p_store_slug text, p_product_slug text) SET search_path = public;
