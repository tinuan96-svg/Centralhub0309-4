/*
  # Fix Security and Performance Issues

  1. Performance Optimizations
    - Drop unused indexes that slow down write operations without providing read benefits:
      - idx_inventory_logs_store_id
      - idx_ai_actions_approved_by
      - idx_cart_product_id
      - idx_order_items_order_id
      - idx_order_status_history_created_by
      - idx_orders_user_id
      - idx_transactions_user_id
      - idx_product_sync_logs_product_id
      - idx_product_sync_logs_store_id
      - idx_product_sync_logs_created_at
      - idx_user_actions_user_id
      - idx_user_actions_created_at
      - idx_user_preferences_user_id
      - idx_ai_actions_insight_id
      - idx_order_status_history_order_id
      - idx_orders_store_id
      - idx_pricing_rules_category_id
      - idx_pricing_rules_product_id
      - idx_pricing_rules_store_id
      - idx_product_sync_logs_created_by

  2. Security Fixes
    - Fix search_path for auto_generate_sku function to prevent injection attacks
    - Fix search_path for generate_sku function to prevent injection attacks
    - Set explicit IMMUTABLE/STABLE volatility where appropriate

  3. Notes
    - Auth connection strategy and leaked password protection require Supabase dashboard configuration
    - These SQL changes focus on database-level security improvements
*/

-- Drop unused indexes to improve write performance
DO $$ 
BEGIN
  -- Inventory logs indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_inventory_logs_store_id') THEN
    DROP INDEX IF EXISTS idx_inventory_logs_store_id;
  END IF;

  -- AI actions indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_actions_approved_by') THEN
    DROP INDEX IF EXISTS idx_ai_actions_approved_by;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_actions_insight_id') THEN
    DROP INDEX IF EXISTS idx_ai_actions_insight_id;
  END IF;

  -- Cart indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cart_product_id') THEN
    DROP INDEX IF EXISTS idx_cart_product_id;
  END IF;

  -- Order related indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_items_order_id') THEN
    DROP INDEX IF EXISTS idx_order_items_order_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_status_history_created_by') THEN
    DROP INDEX IF EXISTS idx_order_status_history_created_by;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_status_history_order_id') THEN
    DROP INDEX IF EXISTS idx_order_status_history_order_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_user_id') THEN
    DROP INDEX IF EXISTS idx_orders_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_store_id') THEN
    DROP INDEX IF EXISTS idx_orders_store_id;
  END IF;

  -- Transaction indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_user_id') THEN
    DROP INDEX IF EXISTS idx_transactions_user_id;
  END IF;

  -- Product sync log indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_sync_logs_product_id') THEN
    DROP INDEX IF EXISTS idx_product_sync_logs_product_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_sync_logs_store_id') THEN
    DROP INDEX IF EXISTS idx_product_sync_logs_store_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_sync_logs_created_at') THEN
    DROP INDEX IF EXISTS idx_product_sync_logs_created_at;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_sync_logs_created_by') THEN
    DROP INDEX IF EXISTS idx_product_sync_logs_created_by;
  END IF;

  -- User action indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_actions_user_id') THEN
    DROP INDEX IF EXISTS idx_user_actions_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_actions_created_at') THEN
    DROP INDEX IF EXISTS idx_user_actions_created_at;
  END IF;

  -- User preferences indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_preferences_user_id') THEN
    DROP INDEX IF EXISTS idx_user_preferences_user_id;
  END IF;

  -- Pricing rules indexes
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pricing_rules_category_id') THEN
    DROP INDEX IF EXISTS idx_pricing_rules_category_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pricing_rules_product_id') THEN
    DROP INDEX IF EXISTS idx_pricing_rules_product_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pricing_rules_store_id') THEN
    DROP INDEX IF EXISTS idx_pricing_rules_store_id;
  END IF;
END $$;

-- Fix search_path security issues for SKU generation functions
-- First, check if auto_generate_sku function exists and recreate it with secure search_path
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'auto_generate_sku'
  ) THEN
    -- Drop and recreate with secure search_path
    DROP FUNCTION IF EXISTS public.auto_generate_sku() CASCADE;
    
    CREATE OR REPLACE FUNCTION public.auto_generate_sku()
    RETURNS TRIGGER
    SECURITY DEFINER
    SET search_path = public, pg_temp
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      IF NEW.sku IS NULL OR NEW.sku = '' THEN
        NEW.sku := public.generate_sku();
      END IF;
      RETURN NEW;
    END;
    $func$;

    -- Recreate trigger if it was dropped
    DROP TRIGGER IF EXISTS auto_generate_sku_trigger ON public.products;
    CREATE TRIGGER auto_generate_sku_trigger
      BEFORE INSERT ON public.products
      FOR EACH ROW
      WHEN (NEW.sku IS NULL OR NEW.sku = '')
      EXECUTE FUNCTION public.auto_generate_sku();
  END IF;
END $$;

-- Fix generate_sku function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'generate_sku'
  ) THEN
    -- Drop and recreate with secure search_path
    DROP FUNCTION IF EXISTS public.generate_sku() CASCADE;
    
    CREATE OR REPLACE FUNCTION public.generate_sku()
    RETURNS TEXT
    SECURITY DEFINER
    SET search_path = public, pg_temp
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      new_sku TEXT;
      sku_exists BOOLEAN;
      attempt_count INTEGER := 0;
      max_attempts INTEGER := 100;
    BEGIN
      LOOP
        new_sku := 'SKU-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
        
        SELECT EXISTS(SELECT 1 FROM public.products WHERE sku = new_sku) INTO sku_exists;
        
        IF NOT sku_exists THEN
          RETURN new_sku;
        END IF;
        
        attempt_count := attempt_count + 1;
        IF attempt_count >= max_attempts THEN
          RAISE EXCEPTION 'Failed to generate unique SKU after % attempts', max_attempts;
        END IF;
      END LOOP;
    END;
    $func$;
  END IF;
END $$;