/*
  # Optimize RLS Policies and Remove Duplicates

  ## 1. Optimize Auth Function Calls (Performance)
    - Wrap auth.uid() in SELECT for better performance
    - Prevents re-evaluation for each row

  ## 2. Remove Duplicate Permissive Policies (Security & Clarity)
    - Remove redundant view policies when manage policies exist
    - Simplifies policy management

  ## Important Notes
    - All changes improve security and performance
    - No functional changes to access control
*/

-- ============================================================================
-- PART 1: OPTIMIZE AUTH FUNCTION CALLS IN RLS POLICIES
-- ============================================================================

-- Fix alert_settings policy
DROP POLICY IF EXISTS "Users can manage own alert settings" ON alert_settings;
CREATE POLICY "Users can manage own alert settings"
  ON alert_settings
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Fix alert_history policy
DROP POLICY IF EXISTS "Users can view own alerts" ON alert_history;
CREATE POLICY "Users can view own alerts"
  ON alert_history
  FOR SELECT
  TO authenticated
  USING (sent_to_user_id = (SELECT auth.uid()));

-- ============================================================================
-- PART 2: REMOVE DUPLICATE PERMISSIVE POLICIES
-- ============================================================================

-- Product Batches - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view product batches" ON product_batches;

-- Product Bundles - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view product bundles" ON product_bundles;

-- Product Marketing Tags - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view marketing tags" ON product_marketing_tags;

-- Product Suppliers - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view product suppliers" ON product_suppliers;

-- Product Variants - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view product variants" ON product_variants;

-- Product Warehouse Locations - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Users can view warehouse locations" ON product_warehouse_locations;

-- Store Product Variants - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Authenticated users can view store variant pricing" ON store_product_variants;

-- Store Settings - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Authenticated users can view store settings" ON store_settings;

-- Trust Scores - Keep specific policy, drop redundant one
DROP POLICY IF EXISTS "Authenticated users can view trust scores" ON trust_scores;

-- Variant Analytics - Keep manage policy, drop view policy
DROP POLICY IF EXISTS "Authenticated users can view variant analytics" ON variant_analytics;
