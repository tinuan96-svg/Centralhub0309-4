/*
  # CentralHub Simplification — Drop Junk Tables

  This migration removes all non-core tables as part of the CentralHub
  simplification to a lightweight commerce engine.

  ## Tables Removed

  ### AI & Intelligence Systems
  - ai_insights, ai_actions, ai_suggestions_log
  - user_context, user_actions, user_preferences
  - product_metrics, product_seo_data
  - bulk_operations_log, pricing_suggestions
  - packing_learning_data
  - data_integrity_scans, data_integrity_issues
  - trust_scores, trust_score_history
  - alert_settings, alert_history, data_health_metrics
  - variant_analytics

  ### Communication Platform
  - comm_automations, comm_campaigns, comm_events
  - comm_messages, comm_otp_codes, comm_templates
  - comm_user_preferences

  ### Marketing System
  - marketing_events, marketing_integrations
  - campaigns, campaign_conversions, campaign_performance
  - audiences, audience_members, utm_links

  ### Finance & Payments (removed previously)
  - bank_transactions, store_bank_accounts
  - gateway_transactions, payout_batches, payment_gateways
  - pricing_rules, gateway_fee_rules, gateway_fee_statistics
  - vat_calculations, vat_reconciliation, vat_audit_log, expenses

  ### Packing / Logistics
  - packing_materials, packing_material_transactions
  - order_packing, order_packing_items
  - packing_purchase_orders, packing_purchase_order_items
  - supplier_material_prices

  ### Multi-store Rules (complex legacy system)
  - ms_stores, ms_products, ms_pricing_rules
  - ms_stock_rules, ms_formatting_rules
  - stock_rules, rule_stores, formatting_rules

  ### Media & Enrichment
  - media_product_mappings, product_marketing_tags
  - image_pipeline_jobs

  ### Admin & Misc
  - store_deletion_audit, store_category_assignments
  - store_brand_assignments, user_nav_permissions
  - product_bundles, main_categories
  - sync_tracking, cashflow_predictions
  - reconciliation_records, cost_history, profit_analytics

  ## Safety
  - Uses DROP TABLE IF EXISTS — safe if tables don't exist
  - CASCADE ensures dependent views/foreign keys are cleaned up
  - Core tables (products, orders, stores, suppliers, inventory) are NOT touched
*/

-- AI & Intelligence
DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS ai_actions CASCADE;
DROP TABLE IF EXISTS ai_suggestions_log CASCADE;
DROP TABLE IF EXISTS user_context CASCADE;
DROP TABLE IF EXISTS user_actions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS product_metrics CASCADE;
DROP TABLE IF EXISTS product_seo_data CASCADE;
DROP TABLE IF EXISTS bulk_operations_log CASCADE;
DROP TABLE IF EXISTS pricing_suggestions CASCADE;
DROP TABLE IF EXISTS packing_learning_data CASCADE;
DROP TABLE IF EXISTS data_integrity_scans CASCADE;
DROP TABLE IF EXISTS data_integrity_issues CASCADE;
DROP TABLE IF EXISTS trust_scores CASCADE;
DROP TABLE IF EXISTS trust_score_history CASCADE;
DROP TABLE IF EXISTS alert_settings CASCADE;
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS data_health_metrics CASCADE;
DROP TABLE IF EXISTS variant_analytics CASCADE;

-- Communication Platform
DROP TABLE IF EXISTS comm_automations CASCADE;
DROP TABLE IF EXISTS comm_campaigns CASCADE;
DROP TABLE IF EXISTS comm_events CASCADE;
DROP TABLE IF EXISTS comm_messages CASCADE;
DROP TABLE IF EXISTS comm_otp_codes CASCADE;
DROP TABLE IF EXISTS comm_templates CASCADE;
DROP TABLE IF EXISTS comm_user_preferences CASCADE;

-- Marketing
DROP TABLE IF EXISTS marketing_events CASCADE;
DROP TABLE IF EXISTS marketing_integrations CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS campaign_conversions CASCADE;
DROP TABLE IF EXISTS campaign_performance CASCADE;
DROP TABLE IF EXISTS audiences CASCADE;
DROP TABLE IF EXISTS audience_members CASCADE;
DROP TABLE IF EXISTS utm_links CASCADE;

-- Finance & Payments
DROP TABLE IF EXISTS bank_transactions CASCADE;
DROP TABLE IF EXISTS store_bank_accounts CASCADE;
DROP TABLE IF EXISTS gateway_transactions CASCADE;
DROP TABLE IF EXISTS payout_batches CASCADE;
DROP TABLE IF EXISTS payment_gateways CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
DROP TABLE IF EXISTS gateway_fee_rules CASCADE;
DROP TABLE IF EXISTS gateway_fee_statistics CASCADE;
DROP TABLE IF EXISTS vat_calculations CASCADE;
DROP TABLE IF EXISTS vat_reconciliation CASCADE;
DROP TABLE IF EXISTS vat_audit_log CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;

-- Packing & Logistics
DROP TABLE IF EXISTS packing_materials CASCADE;
DROP TABLE IF EXISTS packing_material_transactions CASCADE;
DROP TABLE IF EXISTS order_packing CASCADE;
DROP TABLE IF EXISTS order_packing_items CASCADE;
DROP TABLE IF EXISTS packing_purchase_orders CASCADE;
DROP TABLE IF EXISTS packing_purchase_order_items CASCADE;
DROP TABLE IF EXISTS supplier_material_prices CASCADE;

-- Multi-store Rule System (complex legacy)
DROP TABLE IF EXISTS ms_stores CASCADE;
DROP TABLE IF EXISTS ms_products CASCADE;
DROP TABLE IF EXISTS ms_pricing_rules CASCADE;
DROP TABLE IF EXISTS ms_stock_rules CASCADE;
DROP TABLE IF EXISTS ms_formatting_rules CASCADE;
DROP TABLE IF EXISTS stock_rules CASCADE;
DROP TABLE IF EXISTS rule_stores CASCADE;
DROP TABLE IF EXISTS formatting_rules CASCADE;

-- Media & Enrichment
DROP TABLE IF EXISTS media_product_mappings CASCADE;
DROP TABLE IF EXISTS product_marketing_tags CASCADE;
DROP TABLE IF EXISTS image_pipeline_jobs CASCADE;

-- Admin & Misc
DROP TABLE IF EXISTS store_deletion_audit CASCADE;
DROP TABLE IF EXISTS store_category_assignments CASCADE;
DROP TABLE IF EXISTS store_brand_assignments CASCADE;
DROP TABLE IF EXISTS user_nav_permissions CASCADE;
DROP TABLE IF EXISTS product_bundles CASCADE;
DROP TABLE IF EXISTS main_categories CASCADE;
DROP TABLE IF EXISTS sync_tracking CASCADE;
DROP TABLE IF EXISTS cashflow_predictions CASCADE;
DROP TABLE IF EXISTS reconciliation_records CASCADE;
DROP TABLE IF EXISTS cost_history CASCADE;
DROP TABLE IF EXISTS profit_analytics CASCADE;

-- Drop legacy purchase_orders table (packing-related, not supplier POs)
-- Note: suppliers table and supplier-linked purchase orders are kept
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
