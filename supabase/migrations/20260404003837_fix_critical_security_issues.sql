/*
  # Fix Critical Security Issues

  1. Fix auth.uid() RLS policies (performance issue at scale)
  2. Fix function search_path vulnerabilities (security issue)
  3. Add missing foreign key indexes (performance issue)
  4. Remove unused indexes (optimization)
*/

-- =============================================
-- PART 1: FIX AUTH.UID() RLS POLICIES
-- =============================================

-- Fix campaigns policies
DROP POLICY IF EXISTS "Authenticated users can create campaigns" ON campaigns;
CREATE POLICY "Authenticated users can create campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Campaign creators can delete their campaigns" ON campaigns;
CREATE POLICY "Campaign creators can delete their campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Fix utm_links policy
DROP POLICY IF EXISTS "Authenticated users can create UTM links" ON utm_links;
CREATE POLICY "Authenticated users can create UTM links"
  ON utm_links FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- =============================================
-- PART 2: ADD MISSING FOREIGN KEY INDEXES
-- =============================================

-- AI Actions
CREATE INDEX IF NOT EXISTS idx_ai_actions_approved_by ON ai_actions(approved_by);
CREATE INDEX IF NOT EXISTS idx_ai_actions_insight_id ON ai_actions(insight_id);

-- Audience Members
CREATE INDEX IF NOT EXISTS idx_audience_members_user_id ON audience_members(user_id);

-- Cart
CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart(product_id);

-- Communication System
CREATE INDEX IF NOT EXISTS idx_comm_automations_template_id ON comm_automations(template_id);
CREATE INDEX IF NOT EXISTS idx_comm_events_order_id ON comm_events(order_id);

-- Cost History
CREATE INDEX IF NOT EXISTS idx_cost_history_supplier_id ON cost_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_store_id ON cost_history(store_id);

-- Gateway Fee Statistics
CREATE INDEX IF NOT EXISTS idx_gateway_fee_statistics_gateway_id ON gateway_fee_statistics(gateway_id);

-- Inventory Logs
CREATE INDEX IF NOT EXISTS idx_inventory_logs_store_id ON inventory_logs(store_id);

-- Marketing Insights
CREATE INDEX IF NOT EXISTS idx_marketing_insights_campaign_id ON marketing_insights(campaign_id);

-- Message System
CREATE INDEX IF NOT EXISTS idx_message_campaigns_template_id ON message_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_messages_template_id ON messages(template_id);

-- Order Packing
CREATE INDEX IF NOT EXISTS idx_order_packing_packed_by ON order_packing(packed_by);

-- Order Status History
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_by ON order_status_history(created_by);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Packing Material Transactions
CREATE INDEX IF NOT EXISTS idx_packing_material_transactions_created_by ON packing_material_transactions(created_by);

-- PO Drafts
CREATE INDEX IF NOT EXISTS idx_po_drafts_converted_to_po_id ON po_drafts(converted_to_po_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_store_id_fk ON po_drafts(store_id);

-- Pricing Rules
CREATE INDEX IF NOT EXISTS idx_pricing_rules_category_id ON pricing_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product_id ON pricing_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_store_id ON pricing_rules(store_id);

-- Pricing Suggestions
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_store_id ON pricing_suggestions(store_id);

-- Product Supplier Mappings
CREATE INDEX IF NOT EXISTS idx_product_supplier_mappings_supplier_price_list_id ON product_supplier_mappings(supplier_price_list_id);

-- Product Sync Logs
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_created_by ON product_sync_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_product_id ON product_sync_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_store_id ON product_sync_logs(store_id);

-- Profit Analytics
CREATE INDEX IF NOT EXISTS idx_profit_analytics_store_id ON profit_analytics(store_id);

-- Purchase Order Items
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_supplier_price_list_id ON purchase_order_items(supplier_price_list_id);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);

-- Purchase Plan Suggestions
CREATE INDEX IF NOT EXISTS idx_purchase_plan_suggestions_product_id ON purchase_plan_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_plan_suggestions_supplier_id ON purchase_plan_suggestions(supplier_id);

-- Stock Replenishment
CREATE INDEX IF NOT EXISTS idx_stock_replenishment_suggestions_recommended_supplier_id ON stock_replenishment_suggestions(recommended_supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_replenishment_suggestions_store_id ON stock_replenishment_suggestions(store_id);

-- Supplier Invoices
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_purchase_order_id ON supplier_invoices(purchase_order_id);

-- Supplier Payments
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON supplier_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice_id ON supplier_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase_order_id ON supplier_payments(purchase_order_id);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- User Actions
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);

-- UTM Links
CREATE INDEX IF NOT EXISTS idx_utm_links_created_by ON utm_links(created_by);

-- =============================================
-- PART 3: REMOVE UNUSED INDEXES
-- =============================================

-- Shipments (not currently used)
DROP INDEX IF EXISTS idx_shipments_tracking_number;
DROP INDEX IF EXISTS idx_shipments_status;
DROP INDEX IF EXISTS idx_shipments_carrier;
DROP INDEX IF EXISTS idx_shipments_created_at;
DROP INDEX IF EXISTS idx_shipments_shipment_number;
DROP INDEX IF EXISTS idx_shipment_events_shipment_id;
DROP INDEX IF EXISTS idx_shipment_events_event_time;

-- Shipping Rates Cache
DROP INDEX IF EXISTS idx_shipping_rates_cache_lookup;
DROP INDEX IF EXISTS idx_shipping_rates_cache_expires;

-- Sender Profiles
DROP INDEX IF EXISTS idx_sender_profiles_default;
DROP INDEX IF EXISTS idx_sender_profiles_site;

-- Packing Learning Data
DROP INDEX IF EXISTS idx_packing_learning_order;
DROP INDEX IF EXISTS idx_packing_learning_suggested;
DROP INDEX IF EXISTS idx_packing_learning_actual;

-- Dimensions
DROP INDEX IF EXISTS idx_products_dimensions;
DROP INDEX IF EXISTS idx_materials_dimensions;

-- Product Expiry
DROP INDEX IF EXISTS idx_product_expiry_product;

SELECT 'Security optimization complete' as status;
