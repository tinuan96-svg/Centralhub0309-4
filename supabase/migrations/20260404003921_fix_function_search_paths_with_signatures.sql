/*
  # Fix Function Search Path Security Vulnerabilities

  Sets immutable search_path on all SECURITY DEFINER functions
  to prevent search_path hijacking attacks.
*/

-- Functions with no parameters
ALTER FUNCTION populate_inventory_balance() SET search_path = public, pg_temp;
ALTER FUNCTION validate_available_stock() SET search_path = public, pg_temp;
ALTER FUNCTION auto_confirm_order_on_payment() SET search_path = public, pg_temp;
ALTER FUNCTION track_supplier_performance() SET search_path = public, pg_temp;
ALTER FUNCTION update_packing_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION update_material_stock_after_transaction() SET search_path = public, pg_temp;
ALTER FUNCTION sync_packing_cost_to_order() SET search_path = public, pg_temp;
ALTER FUNCTION recalculate_order_packing_total() SET search_path = public, pg_temp;
ALTER FUNCTION recalculate_purchase_order_total() SET search_path = public, pg_temp;
ALTER FUNCTION generate_po_number() SET search_path = public, pg_temp;
ALTER FUNCTION calculate_box_volume() SET search_path = public, pg_temp;
ALTER FUNCTION calculate_order_profit() SET search_path = public, pg_temp;
ALTER FUNCTION update_supplier_price_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION update_marketing_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION calculate_campaign_roas() SET search_path = public, pg_temp;
ALTER FUNCTION increment_utm_clicks() SET search_path = public, pg_temp;
ALTER FUNCTION update_supplier_updated_at() SET search_path = public, pg_temp;

-- Functions with parameters
ALTER FUNCTION update_order_fulfillment_status(uuid, fulfillment_status, text) SET search_path = public, pg_temp;
ALTER FUNCTION bulk_update_fulfillment_status(uuid[], fulfillment_status, text) SET search_path = public, pg_temp;

SELECT '✅ Secured 19 functions with immutable search_path' as status;
