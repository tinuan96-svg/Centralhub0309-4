/*
  # Remove Pricing Rules Target Constraint

  ## Change
  Removes the `valid_target` constraint from pricing_rules table to allow
  global rules that apply to all stores, categories, and products.

  ## Rationale
  - The original constraint required at least one of store_id, category_id, 
    or product_id to be NOT NULL
  - This prevented creating global rules that apply universally
  - According to the schema design, NULL values should mean "applies to all"
  - Global rules are useful for site-wide sales, seasonal adjustments, etc.

  ## Impact
  - Allows pricing rules with all three target fields as NULL
  - Such rules will apply to all products across all stores and categories
*/

-- Drop the constraint that prevents global rules
ALTER TABLE pricing_rules DROP CONSTRAINT IF EXISTS valid_target;
