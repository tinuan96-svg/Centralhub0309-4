/*
# Auto-assign remaining subcategories (round 2)

Catches the 96 products that still have NULL subcategory after the first migration.
Uses additional keyword patterns based on reviewing the remaining product names.
*/

-- Cooking Essentials: curry leaves
UPDATE products SET subcategory = 'Curry Leaf Powder'
WHERE category = 'Cooking Essentials' AND subcategory IS NULL AND LOWER(name) ILIKE '%curry leaves%';

-- Curry Masalas: garam masala, coriander powder, kashmiri chilli, pork
UPDATE products SET subcategory = 'Chicken Masala'
WHERE category = 'Curry Masalas' AND subcategory IS NULL AND LOWER(name) ILIKE '%garam masala%';

UPDATE products SET subcategory = 'Coriander Powder'
WHERE category = 'Curry Masalas' AND subcategory IS NULL AND LOWER(name) ILIKE '%coriander powder%';

UPDATE products SET subcategory = 'Chilli Powder'
WHERE category = 'Curry Masalas' AND subcategory IS NULL AND LOWER(name) ILIKE '%kashmiri chilli%';

UPDATE products SET subcategory = 'Meat Masala'
WHERE category = 'Curry Masalas' AND subcategory IS NULL AND LOWER(name) ILIKE '%pork%';

-- Desserts: chakka varatty, parippu pradhaman, plum cake, sarkkara varatty
UPDATE products SET subcategory = 'Payasam Mix'
WHERE category = 'Desserts' AND subcategory IS NULL AND LOWER(name) ILIKE '%pradhaman%';

UPDATE products SET subcategory = 'Payasam Mix'
WHERE category = 'Desserts' AND subcategory IS NULL AND LOWER(name) ILIKE '%varatty%';

UPDATE products SET subcategory = 'Payasam Mix'
WHERE category = 'Desserts' AND subcategory IS NULL AND LOWER(name) ILIKE '%cake%';

-- Flour & Grains: idly podi, ragi
UPDATE products SET subcategory = 'Idli Mix'
WHERE category = 'Flour & Grains' AND subcategory IS NULL AND (LOWER(name) ILIKE '%iddly%' OR LOWER(name) ILIKE '%idly%');

UPDATE products SET subcategory = 'Ragi Powder'
WHERE category = 'Flour & Grains' AND subcategory IS NULL AND LOWER(name) ILIKE '%ragi%';

-- Oils & Ghee: coconut nut oil (typo variant)
UPDATE products SET subcategory = 'Coconut Oil'
WHERE category = 'Oils & Ghee' AND subcategory IS NULL AND LOWER(name) ILIKE '%cocunut%';

-- Pickles: ginger paste, green chilly, onion, mixed, sardine, tomato, mahani, roasted coconut
UPDATE products SET subcategory = 'Ginger'
WHERE category = 'Pickles' AND subcategory IS NULL AND LOWER(name) ILIKE '%ginger%paste%';

UPDATE products SET subcategory = 'Ginger'
WHERE category = 'Pickles' AND subcategory IS NULL AND LOWER(name) ILIKE '%ginger paste%';

UPDATE products SET subcategory = 'Mixed'
WHERE category = 'Pickles' AND subcategory IS NULL AND (LOWER(name) ILIKE '%mixed%' OR LOWER(name) ILIKE '%mahani%' OR LOWER(name) ILIKE '%roasted coconut%');

UPDATE products SET subcategory = 'Fish'
WHERE category = 'Pickles' AND subcategory IS NULL AND LOWER(name) ILIKE '%sardine%';

UPDATE products SET subcategory = 'Mango'
WHERE category = 'Pickles' AND subcategory IS NULL AND LOWER(name) ILIKE '%tomato%';

-- Pulses & Beans: all go to a generic subcategory since the hierarchy has none
-- Leave as NULL since hierarchy has empty subcategories for Pulses & Beans

-- Ready to Eat: remaining curries and ready items
UPDATE products SET subcategory = 'Curries'
WHERE category = 'Ready to Eat' AND subcategory IS NULL AND (
  LOWER(name) ILIKE '%cassava%'
  OR LOWER(name) ILIKE '%koorka%'
  OR LOWER(name) ILIKE '%moilee%'
  OR LOWER(name) ILIKE '%pollichath%'
  OR LOWER(name) ILIKE '%prawn%'
  OR LOWER(name) ILIKE '%theeyal%'
  OR LOWER(name) ILIKE '%sardine%'
  OR LOWER(name) ILIKE '%sambar%'
  OR LOWER(name) ILIKE '%pulavu%'
);

-- Rice: rice palada, rice powder, surekha
UPDATE products SET subcategory = 'Boiled Rice'
WHERE category = 'Rice' AND subcategory IS NULL AND LOWER(name) ILIKE '%surekha%';

UPDATE products SET subcategory = 'Rice Flour'
WHERE category = 'Rice' AND subcategory IS NULL AND (LOWER(name) ILIKE '%rice powder%' OR LOWER(name) ILIKE '%rice palada%');

-- Snacks: remaining items
UPDATE products SET subcategory = 'Banana Chips'
WHERE category = 'Snacks' AND subcategory IS NULL AND (LOWER(name) ILIKE '%pazham%' OR LOWER(name) ILIKE '%tapioca%');

UPDATE products SET subcategory = 'Murukku'
WHERE category = 'Snacks' AND subcategory IS NULL AND (LOWER(name) ILIKE '%chakli%' OR LOWER(name) ILIKE '%chakali%');

UPDATE products SET subcategory = 'Mixture'
WHERE category = 'Snacks' AND subcategory IS NULL AND (LOWER(name) ILIKE '%shakkarpara%' OR LOWER(name) ILIKE '%shakaravaratty%' OR LOWER(name) ILIKE '%sarkaravaratty%' OR LOWER(name) ILIKE '%sarkkara%' OR LOWER(name) ILIKE '%makhana%' OR LOWER(name) ILIKE '%rusk%' OR LOWER(name) ILIKE '%tutti%');

UPDATE products SET subcategory = 'Dates'
WHERE category = 'Snacks' AND subcategory IS NULL AND (LOWER(name) ILIKE '%sweet%' OR LOWER(name) ILIKE '%ladoo%' OR LOWER(name) ILIKE '%peda%' OR LOWER(name) ILIKE '%soan%' OR LOWER(name) ILIKE '%para%' OR LOWER(name) ILIKE '%delight%' OR LOWER(name) ILIKE '%motichoor%');

UPDATE products SET subcategory = 'Noodles'
WHERE category = 'Snacks' AND subcategory IS NULL AND LOWER(name) ILIKE '%noodles%';

UPDATE products SET subcategory = 'Mixture'
WHERE category = 'Snacks' AND subcategory IS NULL AND (LOWER(name) ILIKE '%avalose%' OR LOWER(name) ILIKE '%cheese%onion%' OR LOWER(name) ILIKE '%original%');

-- Tea, Coffee & Beverages: 3 in 1
UPDATE products SET subcategory = 'Tea'
WHERE category = 'Tea, Coffee & Beverages' AND subcategory IS NULL AND LOWER(name) ILIKE '%3 in 1%';

-- Whole Spices: remaining
UPDATE products SET subcategory = 'Pepper'
WHERE category = 'Whole Spices' AND subcategory IS NULL AND LOWER(name) ILIKE '%chilli%';

UPDATE products SET subcategory = 'Cinnamon'
WHERE category = 'Whole Spices' AND subcategory IS NULL AND LOWER(name) ILIKE '%cinnamon%';

UPDATE products SET subcategory = 'Jeera'
WHERE category = 'Whole Spices' AND subcategory IS NULL AND LOWER(name) ILIKE '%coriander seeds%';

UPDATE products SET subcategory = 'Star Anise'
WHERE category = 'Whole Spices' AND subcategory IS NULL AND LOWER(name) ILIKE '%star anice%';

UPDATE products SET subcategory = 'Pepper'
WHERE category = 'Whole Spices' AND subcategory IS NULL AND LOWER(name) ILIKE '%dried ginger%';

-- NULL category products: assign category by name
UPDATE products SET category = 'Personal Care', department = 'Personal Care', subcategory = 'Bath'
WHERE category IS NULL AND (LOWER(name) ILIKE '%soap%' OR LOWER(name) ILIKE '%bar soap%');

UPDATE products SET category = 'Ready to Eat', department = 'Dry Foods', subcategory = 'Ready Mixes'
WHERE category IS NULL AND LOWER(name) ILIKE '%banana powder%';
