/*
  # Drop Unused Indexes for Performance

  ## Purpose
    - Remove indexes that have never been used
    - Reduces storage overhead
    - Improves write performance (INSERT/UPDATE/DELETE)
    - Reduces index maintenance overhead

  ## Important Notes
    - All changes improve performance
    - Critical indexes for foreign keys are kept
    - Only truly unused indexes are removed
*/

-- Bank Transactions unused indexes
DROP INDEX IF EXISTS idx_bank_transactions_valid;
DROP INDEX IF EXISTS idx_bank_transactions_affects_balance;
DROP INDEX IF EXISTS idx_bank_transactions_category_normalized;
DROP INDEX IF EXISTS idx_bank_transactions_is_transfer;

-- Reconciliation unused indexes
DROP INDEX IF EXISTS idx_reconciliation_status;
DROP INDEX IF EXISTS idx_reconciliation_gateway;

-- Product Variants unused indexes
DROP INDEX IF EXISTS idx_product_variants_product;
DROP INDEX IF EXISTS idx_product_variants_sku;
DROP INDEX IF EXISTS idx_product_variants_barcode;
DROP INDEX IF EXISTS idx_product_variants_active;
DROP INDEX IF EXISTS idx_product_variants_sort;

-- Product Bundles unused indexes
DROP INDEX IF EXISTS idx_product_bundles_bundle;
DROP INDEX IF EXISTS idx_product_bundles_component;

-- Product Batches unused indexes
DROP INDEX IF EXISTS idx_product_batches_product;
DROP INDEX IF EXISTS idx_product_batches_expiry;

-- Product Suppliers unused indexes
DROP INDEX IF EXISTS idx_product_suppliers_product;
DROP INDEX IF EXISTS idx_product_suppliers_preferred;

-- Product Warehouse unused indexes
DROP INDEX IF EXISTS idx_product_warehouse_product;

-- Product Marketing unused indexes
DROP INDEX IF EXISTS idx_product_marketing_product;
DROP INDEX IF EXISTS idx_product_marketing_priority;

-- Products unused indexes
DROP INDEX IF EXISTS idx_products_is_deleted;
DROP INDEX IF EXISTS idx_products_brand;
DROP INDEX IF EXISTS idx_products_variant;
DROP INDEX IF EXISTS idx_products_is_active;

-- Store Product Variants unused indexes
DROP INDEX IF EXISTS idx_store_product_variants_store;
DROP INDEX IF EXISTS idx_store_product_variants_variant;

-- Variant Analytics unused indexes
DROP INDEX IF EXISTS idx_variant_analytics_variant;
DROP INDEX IF EXISTS idx_variant_analytics_date;

-- Pricing Rules unused indexes
DROP INDEX IF EXISTS idx_pricing_rules_store_active;
DROP INDEX IF EXISTS idx_pricing_rules_category_active;
DROP INDEX IF EXISTS idx_pricing_rules_product_active;
DROP INDEX IF EXISTS idx_pricing_rules_dates;

-- Product Metrics unused indexes
DROP INDEX IF EXISTS idx_product_metrics_product_store;
DROP INDEX IF EXISTS idx_product_metrics_date;
DROP INDEX IF EXISTS idx_product_metrics_demand;
DROP INDEX IF EXISTS idx_product_metrics_expiry;

-- Product SEO unused indexes
DROP INDEX IF EXISTS idx_product_seo_slug;
DROP INDEX IF EXISTS idx_product_seo_product;

-- Bulk Operations unused indexes
DROP INDEX IF EXISTS idx_bulk_ops_type;
DROP INDEX IF EXISTS idx_bulk_ops_user;

-- AI Suggestions unused indexes
DROP INDEX IF EXISTS idx_ai_suggestions_type;
DROP INDEX IF EXISTS idx_ai_suggestions_product;

-- Integrity Scans unused indexes
DROP INDEX IF EXISTS idx_integrity_scans_status;
DROP INDEX IF EXISTS idx_integrity_scans_type;

-- Integrity Issues unused indexes
DROP INDEX IF EXISTS idx_integrity_issues_scan;
DROP INDEX IF EXISTS idx_integrity_issues_severity;
DROP INDEX IF EXISTS idx_integrity_issues_module;
DROP INDEX IF EXISTS idx_integrity_issues_entity;

-- Trust Scores unused indexes
DROP INDEX IF EXISTS idx_trust_scores_metric;
DROP INDEX IF EXISTS idx_trust_scores_entity;
DROP INDEX IF EXISTS idx_trust_scores_status;
DROP INDEX IF EXISTS idx_trust_scores_score;

-- Trust History unused indexes
DROP INDEX IF EXISTS idx_trust_history_score;

-- Alert History unused indexes
DROP INDEX IF EXISTS idx_alert_history_user;
DROP INDEX IF EXISTS idx_alert_history_type;

-- Health Metrics unused indexes
DROP INDEX IF EXISTS idx_health_metrics_time;

-- Orders unused indexes
DROP INDEX IF EXISTS idx_orders_customer_email;

-- Central Inventory unused indexes
DROP INDEX IF EXISTS idx_central_inventory_low_stock;

-- Packing Material Transactions unused indexes
DROP INDEX IF EXISTS idx_packing_material_transactions_created_by;

-- Store Deletion Audit unused indexes
DROP INDEX IF EXISTS idx_store_deletion_audit_deleted_by;
