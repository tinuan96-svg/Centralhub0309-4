/*
  # Revoke anon EXECUTE from non-public SECURITY DEFINER functions

  These are admin/internal functions that should never be callable by
  unauthenticated requests via /rest/v1/rpc/. The pocketgrocery_*,
  api_keralagroceries_*, and get_store_products_* functions are intentionally
  left accessible to anon as they serve public storefronts.

  Trigger functions (returning trigger) cannot be called via RPC but are
  included for completeness since they show as executable.
*/

-- Admin/destructive operations
REVOKE EXECUTE ON FUNCTION public.delete_store(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_soft_delete_orders(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_soft_delete_products(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_deleted_product() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_deleted_product_display_rows() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_hard_delete_on_soft_delete() FROM anon;

-- Bulk operations
REVOKE EXECUTE ON FUNCTION public.bulk_set_product_visibility(uuid[], uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_update_fulfillment_status(uuid[], public.fulfillment_status, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_product_visibility(uuid, uuid, boolean) FROM anon;

-- Finance / bank operations
REVOKE EXECUTE ON FUNCTION public.sync_bank_transactions(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_expected_payout(uuid, text, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_bank_balance_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cashflow_analysis(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unreconciled_transactions(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_matching_transactions(uuid, text, numeric, date, integer, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_gateway_transactions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_transaction(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_safely(uuid, uuid, uuid, text) FROM anon;

-- Order operations
REVOKE EXECUTE ON FUNCTION public.update_order_fulfillment_status(uuid, public.fulfillment_status, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_update_fulfillment_status(uuid[], public.fulfillment_status, text) FROM anon;

-- Product admin operations
REVOKE EXECUTE ON FUNCTION public.get_admin_products(text, text, text, uuid, uuid, numeric, numeric, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_assignments_for_store(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_products_for_store_simple(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_visible_products_for_store(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_visibility_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_incomplete_variant_product_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_store_product_stock_override(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_overrides(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_name_override(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_price_override(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_stock_override(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_images_by_product() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_store_product_images_by_store() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_products_visibility_from_store() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_image_backfill() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_images_from_mappings(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_products_to_keralgroceries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pocket_grocery_brand_counts() FROM anon;

-- Internal schema inspection
REVOKE EXECUTE ON FUNCTION public.get_public_schema() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- Auth trigger functions (not meant to be called via RPC)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_signup() FROM anon;

-- Trigger functions (internal, not RPC-callable)
REVOKE EXECUTE ON FUNCTION public.assign_store_id_to_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_confirm_order_on_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_generate_sku() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_sync_has_variants() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_order_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_sku() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_sku(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ms_products_set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_google_sheet() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_product_webhook() FROM anon;
REVOKE EXECUTE ON FUNCTION public.propagate_product_changes_to_store_products() FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_product_image(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_store_product_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_image_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_image_columns_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_media_asset_from_storage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_store_product_image_override() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_image_processing() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_from_inventory() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_from_pricing_rules() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_from_products() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_from_store_products() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_from_stores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_sync_product_images_from_mappings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_catalogue_products_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_media_assets_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cashback_percentage(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cashback_tier(numeric) FROM anon;
