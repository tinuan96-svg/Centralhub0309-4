/*
  # Drop AI-Related Tables

  Removes all tables and data that were exclusively used by the AI features,
  which have been fully removed from the application.

  ## Tables Dropped (if they exist)
  - ai_insights - AI-generated insights
  - ai_actions - AI action records
  - user_context - AI user context memory
  - user_actions - AI user action tracking
  - user_preferences - AI user preferences
  - product_metrics - AI product metrics cache
  - product_seo_data - AI SEO suggestions
  - ai_suggestions_log - AI suggestion history
  - bulk_operations_log - AI bulk operations log
  - cashflow_predictions - AI cashflow predictions
  - reconciliation_records - AI reconciliation records
  - profit_analytics - AI profit analytics cache
  - pricing_suggestions - AI pricing suggestions
  - cost_history - AI cost tracking history
  - packing_learning_data - AI packing ML data
  - supplier_material_prices - AI supplier material price data
  - data_integrity_scans - AI data integrity scan results
  - data_integrity_issues - AI data integrity issues
  - trust_scores - AI trust score records
  - trust_score_history - AI trust score history
  - alert_settings - AI alert configuration
  - alert_history - AI alert history
  - data_health_metrics - AI data health metrics
  - variant_analytics - AI variant analytics
  - marketing_insights - AI marketing insights

  ## Notes
  All drops use IF EXISTS to be safe and non-destructive.
*/

DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS ai_actions CASCADE;
DROP TABLE IF EXISTS user_context CASCADE;
DROP TABLE IF EXISTS user_actions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS product_metrics CASCADE;
DROP TABLE IF EXISTS product_seo_data CASCADE;
DROP TABLE IF EXISTS ai_suggestions_log CASCADE;
DROP TABLE IF EXISTS bulk_operations_log CASCADE;
DROP TABLE IF EXISTS cashflow_predictions CASCADE;
DROP TABLE IF EXISTS reconciliation_records CASCADE;
DROP TABLE IF EXISTS profit_analytics CASCADE;
DROP TABLE IF EXISTS pricing_suggestions CASCADE;
DROP TABLE IF EXISTS cost_history CASCADE;
DROP TABLE IF EXISTS packing_learning_data CASCADE;
DROP TABLE IF EXISTS supplier_material_prices CASCADE;
DROP TABLE IF EXISTS data_integrity_scans CASCADE;
DROP TABLE IF EXISTS data_integrity_issues CASCADE;
DROP TABLE IF EXISTS trust_scores CASCADE;
DROP TABLE IF EXISTS trust_score_history CASCADE;
DROP TABLE IF EXISTS alert_settings CASCADE;
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS data_health_metrics CASCADE;
DROP TABLE IF EXISTS variant_analytics CASCADE;
DROP TABLE IF EXISTS marketing_insights CASCADE;
