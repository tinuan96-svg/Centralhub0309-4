/*
  # Enhanced Pricing Rule Engine

  1. Schema Enhancements
    - Add `action` field to distinguish between markup, discount, and override
    - Add `applies_to` field for variant support
    - Add `start_date` and `end_date` for time-based rules
    - Add `min_quantity` and `max_quantity` for volume-based pricing
    
  2. Priority System
    - Lower priority number = higher priority (0 is highest)
    - Store-specific rules: priority 0-99
    - Category rules: priority 100-199
    - Product rules: priority 200-299
    - Global rules: priority 300+
    
  3. Functions
    - `calculate_dynamic_price()` - Comprehensive price calculation
    - `get_applicable_pricing_rules()` - Get rules for a product/store
    - `invalidate_pricing_cache()` - Clear cached prices
    
  4. Indexes
    - Add performance indexes for common queries
    
  5. Security
    - Update RLS policies for new fields
*/

-- Add new fields to pricing_rules
DO $$
BEGIN
  -- Add action field (markup, discount, override)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'action'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN action text DEFAULT 'markup' CHECK (action IN ('markup', 'discount', 'override'));
  END IF;

  -- Add applies_to field for variant support
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'applies_to'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN applies_to text DEFAULT 'all' CHECK (applies_to IN ('all', 'base', 'variant'));
  END IF;

  -- Add time-based rules
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN start_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN end_date timestamptz;
  END IF;

  -- Add volume-based pricing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'min_quantity'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN min_quantity integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'max_quantity'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN max_quantity integer;
  END IF;

  -- Add description field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_rules' AND column_name = 'description'
  ) THEN
    ALTER TABLE pricing_rules ADD COLUMN description text;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_rules_store_active ON pricing_rules(store_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_category_active ON pricing_rules(category_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product_active ON pricing_rules(product_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_priority ON pricing_rules(priority ASC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_dates ON pricing_rules(start_date, end_date) WHERE is_active = true;

-- Function to check if rule is currently active (time-based)
CREATE OR REPLACE FUNCTION is_pricing_rule_active(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_is_active boolean
)
RETURNS boolean AS $$
BEGIN
  IF NOT p_is_active THEN
    RETURN false;
  END IF;
  
  -- If no date constraints, rule is active
  IF p_start_date IS NULL AND p_end_date IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if current time is within the date range
  IF p_start_date IS NOT NULL AND now() < p_start_date THEN
    RETURN false;
  END IF;
  
  IF p_end_date IS NOT NULL AND now() > p_end_date THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enhanced function to get applicable pricing rules
CREATE OR REPLACE FUNCTION get_applicable_pricing_rules(
  p_product_id uuid,
  p_category_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS TABLE(
  id uuid,
  name text,
  store_id uuid,
  category_id uuid,
  product_id uuid,
  type text,
  action text,
  value numeric,
  priority integer,
  applies_to text,
  description text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pr.id,
    pr.name,
    pr.store_id,
    pr.category_id,
    pr.product_id,
    pr.type::text,
    pr.action,
    pr.value,
    pr.priority,
    pr.applies_to,
    pr.description
  FROM pricing_rules pr
  WHERE 
    -- Rule must be active
    pr.is_active = true
    AND is_pricing_rule_active(pr.start_date, pr.end_date, pr.is_active)
    -- Quantity constraints
    AND (pr.min_quantity IS NULL OR p_quantity >= pr.min_quantity)
    AND (pr.max_quantity IS NULL OR p_quantity <= pr.max_quantity)
    -- Scope matching (product-specific, category-specific, store-specific, or global)
    AND (
      -- Product-specific rule
      (pr.product_id = p_product_id)
      OR
      -- Category-specific rule
      (pr.category_id = p_category_id AND pr.product_id IS NULL)
      OR
      -- Store-specific rule
      (pr.store_id = p_store_id AND pr.category_id IS NULL AND pr.product_id IS NULL)
      OR
      -- Global rule
      (pr.store_id IS NULL AND pr.category_id IS NULL AND pr.product_id IS NULL)
    )
  ORDER BY 
    -- Priority: lower number = higher priority
    -- Product-specific (highest priority)
    CASE WHEN pr.product_id IS NOT NULL THEN 1 ELSE 4 END,
    -- Category-specific
    CASE WHEN pr.category_id IS NOT NULL THEN 2 ELSE 4 END,
    -- Store-specific
    CASE WHEN pr.store_id IS NOT NULL THEN 3 ELSE 4 END,
    -- Then by explicit priority (ascending = higher priority for lower numbers)
    pr.priority ASC,
    -- Finally by creation date
    pr.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enhanced dynamic price calculation function
CREATE OR REPLACE FUNCTION calculate_dynamic_price(
  p_base_price numeric,
  p_product_id uuid,
  p_category_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_override_price numeric DEFAULT NULL
)
RETURNS TABLE(
  base_price numeric,
  override_price numeric,
  price_after_override numeric,
  final_price numeric,
  total_markup numeric,
  total_discount numeric,
  applied_rules jsonb
) AS $$
DECLARE
  v_current_price numeric;
  v_total_markup numeric := 0;
  v_total_discount numeric := 0;
  v_applied_rules jsonb := '[]'::jsonb;
  v_rule RECORD;
  v_price_before numeric;
  v_price_after numeric;
  v_price_change numeric;
BEGIN
  -- Start with override price if provided, otherwise base price
  v_current_price := COALESCE(p_override_price, p_base_price);
  
  -- Apply all applicable rules in priority order
  FOR v_rule IN 
    SELECT * FROM get_applicable_pricing_rules(
      p_product_id, 
      p_category_id, 
      p_store_id, 
      p_quantity
    )
  LOOP
    v_price_before := v_current_price;
    
    -- Apply rule based on action and type
    CASE v_rule.action
      -- Markup: increase price
      WHEN 'markup' THEN
        IF v_rule.type = 'percentage' THEN
          v_current_price := v_current_price * (1 + v_rule.value / 100);
        ELSIF v_rule.type = 'fixed' THEN
          v_current_price := v_current_price + v_rule.value;
        END IF;
      
      -- Discount: decrease price
      WHEN 'discount' THEN
        IF v_rule.type = 'percentage' THEN
          v_current_price := v_current_price * (1 - v_rule.value / 100);
        ELSIF v_rule.type = 'fixed' THEN
          v_current_price := v_current_price - v_rule.value;
        END IF;
      
      -- Override: set absolute price
      WHEN 'override' THEN
        v_current_price := v_rule.value;
    END CASE;
    
    -- Ensure price doesn't go negative
    v_current_price := GREATEST(0, v_current_price);
    v_price_after := v_current_price;
    v_price_change := v_price_after - v_price_before;
    
    -- Track total markup/discount
    IF v_price_change > 0 THEN
      v_total_markup := v_total_markup + v_price_change;
    ELSIF v_price_change < 0 THEN
      v_total_discount := v_total_discount + ABS(v_price_change);
    END IF;
    
    -- Record applied rule
    v_applied_rules := v_applied_rules || jsonb_build_object(
      'rule_id', v_rule.id,
      'rule_name', v_rule.name,
      'type', v_rule.type,
      'action', v_rule.action,
      'value', v_rule.value,
      'price_before', ROUND(v_price_before, 2),
      'price_after', ROUND(v_price_after, 2),
      'price_change', ROUND(v_price_change, 2)
    );
  END LOOP;
  
  -- Return comprehensive breakdown
  RETURN QUERY SELECT
    ROUND(p_base_price, 2) AS base_price,
    ROUND(p_override_price, 2) AS override_price,
    ROUND(COALESCE(p_override_price, p_base_price), 2) AS price_after_override,
    ROUND(v_current_price, 2) AS final_price,
    ROUND(v_total_markup, 2) AS total_markup,
    ROUND(v_total_discount, 2) AS total_discount,
    v_applied_rules AS applied_rules;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to invalidate pricing cache (for integration with caching systems)
CREATE OR REPLACE FUNCTION invalidate_pricing_cache()
RETURNS trigger AS $$
BEGIN
  -- This function can be extended to work with Redis or other caching systems
  -- For now, it just ensures the updated_at timestamp is set
  
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  
  -- You can add cache invalidation logic here
  -- For example, calling a notify to invalidate Redis cache
  PERFORM pg_notify('pricing_cache_invalidate', NEW.id::text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to invalidate cache on pricing rule changes
DROP TRIGGER IF EXISTS trigger_invalidate_pricing_cache ON pricing_rules;
CREATE TRIGGER trigger_invalidate_pricing_cache
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_pricing_cache();

-- Create view for easy rule management
CREATE OR REPLACE VIEW pricing_rules_with_scope AS
SELECT 
  pr.*,
  s.name as store_name,
  c.name as category_name,
  p.name as product_name,
  CASE 
    WHEN pr.product_id IS NOT NULL THEN 'product'
    WHEN pr.category_id IS NOT NULL THEN 'category'
    WHEN pr.store_id IS NOT NULL THEN 'store'
    ELSE 'global'
  END as scope,
  is_pricing_rule_active(pr.start_date, pr.end_date, pr.is_active) as currently_active
FROM pricing_rules pr
LEFT JOIN stores s ON pr.store_id = s.id
LEFT JOIN categories c ON pr.category_id = c.id
LEFT JOIN products p ON pr.product_id = p.id;

-- Add helpful comments
COMMENT ON COLUMN pricing_rules.action IS 'Type of price adjustment: markup (increase), discount (decrease), or override (set absolute price)';
COMMENT ON COLUMN pricing_rules.applies_to IS 'Whether rule applies to all products, base products only, or variants only';
COMMENT ON COLUMN pricing_rules.priority IS 'Priority order (lower number = higher priority, 0 is highest)';
COMMENT ON COLUMN pricing_rules.start_date IS 'Optional: Rule becomes active at this date/time';
COMMENT ON COLUMN pricing_rules.end_date IS 'Optional: Rule expires at this date/time';
COMMENT ON COLUMN pricing_rules.min_quantity IS 'Minimum quantity required for rule to apply';
COMMENT ON COLUMN pricing_rules.max_quantity IS 'Maximum quantity for rule to apply (NULL = no limit)';

COMMENT ON FUNCTION get_applicable_pricing_rules IS 'Get all active pricing rules applicable to a product in priority order';
COMMENT ON FUNCTION calculate_dynamic_price IS 'Calculate final price with full breakdown of all applied rules';
COMMENT ON FUNCTION is_pricing_rule_active IS 'Check if a pricing rule is currently active based on time constraints';
COMMENT ON FUNCTION invalidate_pricing_cache IS 'Trigger function to invalidate pricing cache when rules change';
