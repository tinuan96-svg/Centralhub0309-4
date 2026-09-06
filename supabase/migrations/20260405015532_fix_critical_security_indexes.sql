/*
  # Fix Critical Security and Performance Issues - Part 1: Indexes

  ## 1. Add Missing Foreign Key Indexes (Performance & Security)
    - Add indexes for all 90+ unindexed foreign keys
    - Improves join performance and prevents table scans
    - Critical for maintaining good query performance at scale

  ## Important Notes
    - All changes are backwards compatible
    - No data loss or breaking changes
    - Focuses on performance optimization
*/

-- AI Actions indexes
CREATE INDEX IF NOT EXISTS idx_ai_actions_approved_by ON ai_actions(approved_by);
CREATE INDEX IF NOT EXISTS idx_ai_actions_insight_id ON ai_actions(insight_id);

-- AI Suggestions Log indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_log_accepted_by ON ai_suggestions_log(accepted_by);

-- Alert History indexes
CREATE INDEX IF NOT EXISTS idx_alert_history_issue_id ON alert_history(issue_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_scan_id ON alert_history(scan_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_trust_score_id ON alert_history(trust_score_id);

-- Audience Members indexes
CREATE INDEX IF NOT EXISTS idx_audience_members_user_id ON audience_members(user_id);

-- Backorder Items indexes
CREATE INDEX IF NOT EXISTS idx_backorder_items_product_id ON backorder_items(product_id);

-- Campaign Conversions indexes
CREATE INDEX IF NOT EXISTS idx_campaign_conversions_campaign_id ON campaign_conversions(campaign_id);

-- Campaigns indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON campaigns(created_by);

-- Cart indexes
CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart(product_id);

-- Communication Automations indexes
CREATE INDEX IF NOT EXISTS idx_comm_automations_template_id ON comm_automations(template_id);

-- Communication Events indexes
CREATE INDEX IF NOT EXISTS idx_comm_events_order_id ON comm_events(order_id);

-- Cost History indexes
CREATE INDEX IF NOT EXISTS idx_cost_history_product_id ON cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_supplier_id ON cost_history(supplier_id);

-- Data Health Metrics indexes
CREATE INDEX IF NOT EXISTS idx_data_health_metrics_scan_id ON data_health_metrics(scan_id);

-- Data Integrity Issues indexes
CREATE INDEX IF NOT EXISTS idx_data_integrity_issues_fixed_by ON data_integrity_issues(fixed_by);

-- Data Integrity Scans indexes
CREATE INDEX IF NOT EXISTS idx_data_integrity_scans_triggered_by ON data_integrity_scans(triggered_by);

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON expenses(supplier_id);

-- Gateway Fee Rules indexes
CREATE INDEX IF NOT EXISTS idx_gateway_fee_rules_gateway_id ON gateway_fee_rules(gateway_id);

-- Gateway Fee Statistics indexes
CREATE INDEX IF NOT EXISTS idx_gateway_fee_statistics_gateway_id ON gateway_fee_statistics(gateway_id);

-- Gateway Transactions indexes
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_gateway_id ON gateway_transactions(gateway_id);

-- Homepage Section Products indexes
CREATE INDEX IF NOT EXISTS idx_homepage_section_products_product_id ON homepage_section_products(product_id);

-- Inventory Logs indexes
CREATE INDEX IF NOT EXISTS idx_inventory_logs_store_id ON inventory_logs(store_id);

-- Marketing Events indexes
CREATE INDEX IF NOT EXISTS idx_marketing_events_product_id ON marketing_events(product_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_user_id ON marketing_events(user_id);

-- Marketing Insights indexes
CREATE INDEX IF NOT EXISTS idx_marketing_insights_campaign_id ON marketing_insights(campaign_id);

-- Material Purchase Order Items indexes
CREATE INDEX IF NOT EXISTS idx_material_po_items_material_id ON material_purchase_order_items(material_id);

-- Message Campaigns indexes
CREATE INDEX IF NOT EXISTS idx_message_campaigns_template_id ON message_campaigns(template_id);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_template_id ON messages(template_id);

-- Order Packing indexes
CREATE INDEX IF NOT EXISTS idx_order_packing_packed_by ON order_packing(packed_by);
CREATE INDEX IF NOT EXISTS idx_order_packing_suggested_box_id ON order_packing(suggested_box_id);

-- Order Packing Items indexes
CREATE INDEX IF NOT EXISTS idx_order_packing_items_material_id ON order_packing_items(material_id);
CREATE INDEX IF NOT EXISTS idx_order_packing_items_order_packing_id ON order_packing_items(order_packing_id);

-- Order Status History indexes
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_by ON order_status_history(created_by);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_gateway_id ON orders(gateway_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Packing Learning Data indexes
CREATE INDEX IF NOT EXISTS idx_packing_learning_actual_box_id ON packing_learning_data(actual_box_id);
CREATE INDEX IF NOT EXISTS idx_packing_learning_suggested_box_id ON packing_learning_data(suggested_box_id);

-- Packing Material Transactions indexes
CREATE INDEX IF NOT EXISTS idx_packing_material_txn_material_id ON packing_material_transactions(material_id);

-- Payout Batches indexes
CREATE INDEX IF NOT EXISTS idx_payout_batches_gateway_id ON payout_batches(gateway_id);

-- PO Drafts indexes
CREATE INDEX IF NOT EXISTS idx_po_drafts_supplier_id ON po_drafts(supplier_id);

-- Pricing Suggestions indexes
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_store_id ON pricing_suggestions(store_id);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_product_id ON pricing_suggestions(product_id);

-- Product Batches indexes
CREATE INDEX IF NOT EXISTS idx_product_batches_store_id ON product_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_supplier_id ON product_batches(supplier_id);

-- Product Expiry indexes
CREATE INDEX IF NOT EXISTS idx_product_expiry_product_id ON product_expiry(product_id);

-- Product Feeds indexes
CREATE INDEX IF NOT EXISTS idx_product_feeds_product_id ON product_feeds(product_id);

-- Product Marketing Tags indexes
CREATE INDEX IF NOT EXISTS idx_product_marketing_tags_store_id ON product_marketing_tags(store_id);

-- Product Metrics indexes
CREATE INDEX IF NOT EXISTS idx_product_metrics_store_id ON product_metrics(store_id);

-- Product Supplier Map indexes
CREATE INDEX IF NOT EXISTS idx_product_supplier_map_supplier_id ON product_supplier_map(supplier_id);

-- Product Supplier Mappings indexes
CREATE INDEX IF NOT EXISTS idx_product_supplier_mappings_supplier_id ON product_supplier_mappings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_mappings_price_list_id ON product_supplier_mappings(supplier_price_list_id);

-- Product Suppliers indexes
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_id ON product_suppliers(supplier_id);

-- Product Sync Logs indexes
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_created_by ON product_sync_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_product_id ON product_sync_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_store_id ON product_sync_logs(store_id);

-- Product Warehouse Locations indexes
CREATE INDEX IF NOT EXISTS idx_product_warehouse_locations_store_id ON product_warehouse_locations(store_id);

-- Profit Analytics indexes
CREATE INDEX IF NOT EXISTS idx_profit_analytics_store_id ON profit_analytics(store_id);

-- Promotion Items indexes
CREATE INDEX IF NOT EXISTS idx_promotion_items_campaign_id ON promotion_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promotion_items_product_id ON promotion_items(product_id);

-- Promotion Rules indexes
CREATE INDEX IF NOT EXISTS idx_promotion_rules_campaign_id ON promotion_rules(campaign_id);

-- Purchase Order Items indexes
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_price_list_id ON purchase_order_items(supplier_price_list_id);

-- Purchase Orders indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_id ON purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);

-- Purchase Plan Suggestions indexes
CREATE INDEX IF NOT EXISTS idx_purchase_plan_suggestions_product_id ON purchase_plan_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_plan_suggestions_supplier_id ON purchase_plan_suggestions(supplier_id);

-- Shipment Events indexes
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id);

-- Shipments indexes
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);

-- Stock Replenishment Suggestions indexes
CREATE INDEX IF NOT EXISTS idx_stock_replenishment_product_id ON stock_replenishment_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_replenishment_supplier_id ON stock_replenishment_suggestions(recommended_supplier_id);

-- Store Brand Assignments indexes
CREATE INDEX IF NOT EXISTS idx_store_brand_assignments_brand_id ON store_brand_assignments(brand_id);

-- Store Category Assignments indexes
CREATE INDEX IF NOT EXISTS idx_store_category_assignments_category_id ON store_category_assignments(category_id);

-- Supplier Contacts indexes
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);

-- Supplier Material Prices indexes
CREATE INDEX IF NOT EXISTS idx_supplier_material_prices_material_id ON supplier_material_prices(material_id);

-- Supplier Payments indexes
CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by ON supplier_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice_id ON supplier_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);

-- Supplier Price Lists indexes
CREATE INDEX IF NOT EXISTS idx_supplier_price_lists_product_id ON supplier_price_lists(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_lists_supplier_id ON supplier_price_lists(supplier_id);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Trust Scores indexes
CREATE INDEX IF NOT EXISTS idx_trust_scores_store_id ON trust_scores(store_id);

-- User Actions indexes
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);

-- UTM Links indexes
CREATE INDEX IF NOT EXISTS idx_utm_links_campaign_id ON utm_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_utm_links_created_by ON utm_links(created_by);

-- Variant Analytics indexes
CREATE INDEX IF NOT EXISTS idx_variant_analytics_store_id ON variant_analytics(store_id);
