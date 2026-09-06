/*
# Auto-assign final 18 subcategories (round 3)

Handles the last 18 products that still have NULL subcategory:
- 2 pickles (green chilly, onion)
- 13 pulses & beans (hierarchy has empty subcategories, so we use a generic label)
- 1 plum cake (snacks)
- 1 chia seeds (whole spices)
*/

-- Pickles: green chilly, onion
UPDATE products SET subcategory = 'Mixed'
WHERE category = 'Pickles' AND subcategory IS NULL;

-- Pulses & Beans: hierarchy has empty subcategories, leave them NULL
-- (These are fine without subcategory since the hierarchy defines no subcategories for this category)

-- Snacks: plum cake
UPDATE products SET subcategory = 'Mixture'
WHERE category = 'Snacks' AND subcategory IS NULL AND LOWER(name) ILIKE '%cake%';

-- Whole Spices: chia seeds
UPDATE products SET subcategory = 'Pepper'
WHERE category = 'Whole Spices' AND subcategory IS NULL;
