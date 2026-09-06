/*
  # Fix trigger function permissions for store_category_mappings

  ## Problem
  When a product is updated, trigger functions fn_keralagroceries_apply_rules and
  fn_pocketgrocery_apply_rules run as SECURITY INVOKER (the calling user). These
  functions SELECT from store_category_mappings which has RLS enabled. Since triggers
  run without an auth context, auth.uid() returns null and the RLS policy blocks access,
  causing "permission denied for table store_category_mappings".

  ## Fix
  Set the affected trigger functions to SECURITY DEFINER so they execute as the
  function owner (postgres) and bypass RLS. This is the correct pattern for internal
  trigger functions that need to read related tables for business logic.

  Also fixes propagate_product_changes_to_store_products for the same reason.
*/

ALTER FUNCTION fn_keralagroceries_apply_rules() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION fn_pocketgrocery_apply_rules() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION propagate_product_changes_to_store_products() SECURITY DEFINER SET search_path = public;
