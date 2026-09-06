/*
  # Fix Security and Performance Issues

  ## Overview
  This migration addresses critical security and performance issues identified in the database audit:
  - Add missing indexes on foreign keys for optimal query performance
  - Optimize RLS policies to prevent auth function re-evaluation
  - Fix overly permissive RLS policies

  ## Changes

  ### 1. Foreign Key Indexes
  Add covering indexes for all unindexed foreign keys to improve join performance:
  - `ai_actions.insight_id`
  - `order_status_history.order_id`
  - `orders.store_id`
  - `pricing_rules.category_id`, `pricing_rules.product_id`, `pricing_rules.store_id`
  - `product_sync_logs.created_by`
  - `store_products.store_id`

  ### 2. RLS Policy Optimization
  Replace direct `auth.uid()` calls with `(select auth.uid())` to prevent function re-evaluation:
  - All policies on `user_preferences` table
  - All policies on `user_context` table
  - All policies on `user_actions` table

  ### 3. RLS Policy Security Fix
  Fix overly permissive policy on `product_sync_logs` table

  ## Performance Impact
  - Foreign key indexes: Significant improvement for join queries
  - RLS optimization: 10-100x performance improvement at scale
  - Policy fix: Enhanced security without performance impact
*/

-- =====================================================
-- SECTION 1: Add Missing Foreign Key Indexes
-- =====================================================

-- Index for ai_actions.insight_id
CREATE INDEX IF NOT EXISTS idx_ai_actions_insight_id 
  ON public.ai_actions(insight_id);

-- Index for order_status_history.order_id (already exists as idx_order_items_order_id, but let's ensure)
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id 
  ON public.order_status_history(order_id);

-- Index for orders.store_id
CREATE INDEX IF NOT EXISTS idx_orders_store_id 
  ON public.orders(store_id);

-- Index for pricing_rules.category_id
CREATE INDEX IF NOT EXISTS idx_pricing_rules_category_id 
  ON public.pricing_rules(category_id);

-- Index for pricing_rules.product_id
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product_id 
  ON public.pricing_rules(product_id);

-- Index for pricing_rules.store_id
CREATE INDEX IF NOT EXISTS idx_pricing_rules_store_id 
  ON public.pricing_rules(store_id);

-- Index for product_sync_logs.created_by
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_created_by 
  ON public.product_sync_logs(created_by);

-- Index for store_products.store_id
CREATE INDEX IF NOT EXISTS idx_store_products_store_id 
  ON public.store_products(store_id);

-- =====================================================
-- SECTION 2: Optimize RLS Policies - user_preferences
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- SECTION 3: Optimize RLS Policies - user_context
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can insert own context" ON public.user_context;
DROP POLICY IF EXISTS "Users can update own context" ON public.user_context;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Users can view own context"
  ON public.user_context
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own context"
  ON public.user_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own context"
  ON public.user_context
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- SECTION 4: Optimize RLS Policies - user_actions
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own actions" ON public.user_actions;
DROP POLICY IF EXISTS "Users can insert own actions" ON public.user_actions;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Users can view own actions"
  ON public.user_actions
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own actions"
  ON public.user_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- SECTION 5: Fix Overly Permissive RLS Policy
-- =====================================================

-- Drop the always-true policy on product_sync_logs
DROP POLICY IF EXISTS "Authenticated users can insert sync logs" ON public.product_sync_logs;

-- Create a more restrictive policy that checks user authentication
-- and ensures created_by matches the authenticated user
CREATE POLICY "Users can insert own sync logs"
  ON public.product_sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (select auth.uid()));
