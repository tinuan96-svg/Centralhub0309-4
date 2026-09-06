/*
# Auto-assign department, subcategory, and align category names

## What this migration does

1. Renames existing category values to match the CATEGORY_HIERARCHY constant used by the frontend filter dropdowns
2. Splits "Whole & Ground Spices" into "Whole Spices" or "Ground Spices" based on whether the product name contains "powder" or "crushed"
3. Splits "Snacks & Sweets" into "Snacks" or "Biscuits & Chocolates" based on product name keywords
4. Splits "Household & Cleaning" into appropriate Household subcategories (Laundry, Cleaning, Air Fresheners)
5. Splits "Health & Personal Care" into "Personal Care" with subcategories (Bath, Oral Care, Skin Care, Feminine Care)
6. Sets the `department` column for all products based on their category
7. Auto-assigns `subcategory` values by matching product names against known keywords from the category hierarchy
8. Attempts to categorize the 36 products that currently have NULL category by matching product name keywords

## Important notes
- This is a DATA-ONLY migration (no schema changes, no DDL)
- All updates use ILIKE for case-insensitive matching
- Products that don't match any keyword get subcategory = NULL (can be manually assigned later)
- The migration is idempotent: re-running it will produce the same results
*/

-- Step 1: Rename categories to match the hierarchy constant
UPDATE products SET category = 'Rice' WHERE category = 'Rices';
UPDATE products SET category = 'Oils & Ghee' WHERE category = 'Oils & Fats';
UPDATE products SET category = 'Pickles' WHERE category = 'Pickles & Preserves';
UPDATE products SET category = 'Cooking Essentials' WHERE category = 'Seasonings & Condiments';
UPDATE products SET category = 'Tea, Coffee & Beverages' WHERE category = 'Tea & Coffee';

-- Step 2: Split "Whole & Ground Spices" into "Whole Spices" or "Ground Spices"
UPDATE products
SET category = CASE
  WHEN LOWER(name) ILIKE '%powder%' OR LOWER(name) ILIKE '%crushed%' THEN 'Ground Spices'
  ELSE 'Whole Spices'
END
WHERE category = 'Whole & Ground Spices';

-- Step 3: Split "Snacks & Sweets" into "Snacks" or "Biscuits & Chocolates"
UPDATE products
SET category = CASE
  WHEN LOWER(name) ILIKE '%biscuit%'
    OR LOWER(name) ILIKE '%cookie%'
    OR LOWER(name) ILIKE '%choco%'
    OR LOWER(name) ILIKE '%croissant%'
    OR LOWER(name) ILIKE '%eclair%'
    OR LOWER(name) ILIKE '%chocolate%'
    OR LOWER(name) ILIKE '%nutella%'
    OR LOWER(name) ILIKE '%cadbury%'
    OR LOWER(name) ILIKE '%oreo%'
    OR LOWER(name) ILIKE '%kitkat%'
    OR LOWER(name) ILIKE '%spread%'
  THEN 'Biscuits & Chocolates'
  ELSE 'Snacks'
END
WHERE category = 'Snacks & Sweets';

-- Step 4: Rename "Health & Personal Care" to "Personal Care"
UPDATE products SET category = 'Personal Care' WHERE category = 'Health & Personal Care';

-- Step 5: Rename "Household & Cleaning" to "Household"
UPDATE products SET category = 'Household' WHERE category = 'Household & Cleaning';

-- Step 6: Assign categories to products with NULL category based on name keywords
UPDATE products SET category = 'Rice'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%rice%' OR LOWER(name) ILIKE '%jaya rice%'
);

UPDATE products SET category = 'Flour & Grains'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%puttu%'
  OR LOWER(name) ILIKE '%podi%'
  OR LOWER(name) ILIKE '%powder white%'
  OR LOWER(name) ILIKE '%rice powder%'
  OR LOWER(name) ILIKE '%rice flour%'
  OR LOWER(name) ILIKE '%appam%'
  OR LOWER(name) ILIKE '%idiyappam%'
  OR LOWER(name) ILIKE '%pathiri%'
  OR LOWER(name) ILIKE '%dosa%'
  OR LOWER(name) ILIKE '%atta%'
  OR LOWER(name) ILIKE '%gram flour%'
  OR LOWER(name) ILIKE '%aval%'
);

UPDATE products SET category = 'Curry Masalas'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%masala%'
  OR LOWER(name) ILIKE '%sambar%'
  OR LOWER(name) ILIKE '%rasam%'
);

UPDATE products SET category = 'Pickles'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%pickle%'
  OR LOWER(name) ILIKE '%prawn pickle%'
);

UPDATE products SET category = 'Ready to Eat'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%prawns roast%'
  OR LOWER(name) ILIKE '%soya% fry%'
  OR LOWER(name) ILIKE '%roast%'
);

UPDATE products SET category = 'Snacks'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%chips%'
  OR LOWER(name) ILIKE '%mixture%'
  OR LOWER(name) ILIKE '%spicy mixture%'
);

UPDATE products SET category = 'Desserts'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%ada%'
  OR LOWER(name) ILIKE '%payasam%'
  OR LOWER(name) ILIKE '%vermicelli%'
  OR LOWER(name) ILIKE '%semiya%'
  OR LOWER(name) ILIKE '%varatty%'
  OR LOWER(name) ILIKE '%cake%'
);

UPDATE products SET category = 'Cooking Essentials'
WHERE category IS NULL AND (
  LOWER(name) ILIKE '%salt%'
  OR LOWER(name) ILIKE '%sugar%'
);

UPDATE products SET category = 'Oils & Ghee'
WHERE category IS NULL AND LOWER(name) ILIKE '%coconut oil%';

UPDATE products SET category = 'Pulses & Beans'
WHERE category IS NULL AND LOWER(name) ILIKE '%cow peas%';

UPDATE products SET category = 'Household'
WHERE category IS NULL AND LOWER(name) ILIKE '%power plus%';

-- Step 7: Set department based on category
UPDATE products SET department = 'Dry Foods'
WHERE category IN (
  'Rice', 'Flour & Grains', 'Pulses & Beans', 'Oils & Ghee',
  'Whole Spices', 'Ground Spices', 'Curry Masalas', 'Pickles',
  'Cooking Essentials', 'Desserts', 'Ready to Eat', 'Snacks',
  'Biscuits & Chocolates', 'Tea, Coffee & Beverages', 'Fryums'
);

UPDATE products SET department = 'Personal Care'
WHERE category = 'Personal Care';

UPDATE products SET department = 'Household'
WHERE category = 'Household';

-- Step 8: Auto-assign subcategories based on product name keywords

-- Rice subcategories
UPDATE products SET subcategory = 'Matta Rice'
WHERE category = 'Rice' AND LOWER(name) ILIKE '%matta%';

UPDATE products SET subcategory = 'Basmati Rice'
WHERE category = 'Rice' AND LOWER(name) ILIKE '%basmati%';

UPDATE products SET subcategory = 'Ponni Rice'
WHERE category = 'Rice' AND LOWER(name) ILIKE '%ponni%';

UPDATE products SET subcategory = 'Jaya Rice'
WHERE category = 'Rice' AND LOWER(name) ILIKE '%jaya%';

UPDATE products SET subcategory = 'Idli Rice'
WHERE category = 'Rice' AND LOWER(name) ILIKE '%idli%';

-- Flour & Grains subcategories
UPDATE products SET subcategory = 'Puttu Podi'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%puttu%';

UPDATE products SET subcategory = 'Appam Podi'
WHERE category = 'Flour & Grains' AND (LOWER(name) ILIKE '%appam%' OR LOWER(name) ILIKE '%palappam%');

UPDATE products SET subcategory = 'Idiyappam Podi'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%idiyappam%' AND LOWER(name) NOT ILIKE '%puttu%';

UPDATE products SET subcategory = 'Pathiri Podi'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%pathiri%';

UPDATE products SET subcategory = 'Dosa Mix'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%dosa%';

UPDATE products SET subcategory = 'Idli Mix'
WHERE category = 'Flour & Grains' AND (LOWER(name) ILIKE '%idli%' OR LOWER(name) ILIKE '%idly%') AND LOWER(name) NOT ILIKE '%puttu%' AND LOWER(name) NOT ILIKE '%appam%' AND LOWER(name) NOT ILIKE '%dosa%';

UPDATE products SET subcategory = 'Rice Flour'
WHERE category = 'Flour & Grains' AND (LOWER(name) ILIKE '%rice flour%' OR LOWER(name) ILIKE '%rice powder%');

UPDATE products SET subcategory = 'Atta'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%atta%';

UPDATE products SET subcategory = 'Gram Flour'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%gram flour%';

UPDATE products SET subcategory = 'Aval'
WHERE category = 'Flour & Grains' AND LOWER(name) ILIKE '%aval%';

UPDATE products SET subcategory = 'Semolina'
WHERE category = 'Flour & Grains' AND (LOWER(name) ILIKE '%rava%' OR LOWER(name) ILIKE '%semolina%');

-- Oils & Ghee subcategories
UPDATE products SET subcategory = 'Coconut Oil'
WHERE category = 'Oils & Ghee' AND LOWER(name) ILIKE '%coconut%';

UPDATE products SET subcategory = 'Sunflower Oil'
WHERE category = 'Oils & Ghee' AND LOWER(name) ILIKE '%sunflower%';

UPDATE products SET subcategory = 'Sesame Oil'
WHERE category = 'Oils & Ghee' AND (LOWER(name) ILIKE '%sesame%' OR LOWER(name) ILIKE '%gingelly%');

UPDATE products SET subcategory = 'Olive Oil'
WHERE category = 'Oils & Ghee' AND LOWER(name) ILIKE '%olive%';

UPDATE products SET subcategory = 'Ghee'
WHERE category = 'Oils & Ghee' AND LOWER(name) ILIKE '%ghee%';

-- Whole Spices subcategories
UPDATE products SET subcategory = 'Cardamom'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%cardamom%';

UPDATE products SET subcategory = 'Cloves'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%cloves%';

UPDATE products SET subcategory = 'Mustard'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%mustard%';

UPDATE products SET subcategory = 'Jeera'
WHERE category = 'Whole Spices' AND (LOWER(name) ILIKE '%cumin%' OR LOWER(name) ILIKE '%jeera%');

UPDATE products SET subcategory = 'Fennel'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%fennel%';

UPDATE products SET subcategory = 'Bay Leaves'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%bay leaves%';

UPDATE products SET subcategory = 'Star Anise'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%star anise%';

UPDATE products SET subcategory = 'Nutmeg'
WHERE category = 'Whole Spices' AND (LOWER(name) ILIKE '%nutmeg%' OR LOWER(name) ILIKE '%jathipathri%' OR LOWER(name) ILIKE '%mace%');

UPDATE products SET subcategory = 'Pepper'
WHERE category = 'Whole Spices' AND LOWER(name) ILIKE '%pepper%' AND LOWER(name) NOT ILIKE '%powder%';

-- Ground Spices subcategories
UPDATE products SET subcategory = 'Chilli Powder'
WHERE category = 'Ground Spices' AND (LOWER(name) ILIKE '%chilli%' OR LOWER(name) ILIKE '%chili%' OR LOWER(name) ILIKE '%crushed%');

UPDATE products SET subcategory = 'Turmeric'
WHERE category = 'Ground Spices' AND LOWER(name) ILIKE '%turmeric%';

UPDATE products SET subcategory = 'Coriander Powder'
WHERE category = 'Ground Spices' AND LOWER(name) ILIKE '%coriander%';

UPDATE products SET subcategory = 'Pepper Powder'
WHERE category = 'Ground Spices' AND LOWER(name) ILIKE '%pepper%';

UPDATE products SET subcategory = 'Cinnamon Powder'
WHERE category = 'Ground Spices' AND LOWER(name) ILIKE '%cinnamon%';

UPDATE products SET subcategory = 'Fenugreek Powder'
WHERE category = 'Ground Spices' AND LOWER(name) ILIKE '%fenugreek%';

-- Curry Masalas subcategories
UPDATE products SET subcategory = 'Chicken Masala'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%chicken masala%' AND LOWER(name) NOT ILIKE '%chilli%' AND LOWER(name) NOT ILIKE '%65%';

UPDATE products SET subcategory = 'Chilli Chicken'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%chilli chicken%';

UPDATE products SET subcategory = 'Chicken 65'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%chicken 65%';

UPDATE products SET subcategory = 'Fish Masala'
WHERE category = 'Curry Masalas' AND (LOWER(name) ILIKE '%fish masala%' OR LOWER(name) ILIKE '%fish curry masala%');

UPDATE products SET subcategory = 'Fish Fry'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%fish fry%';

UPDATE products SET subcategory = 'Beef Masala'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%beef%';

UPDATE products SET subcategory = 'Mutton Masala'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%mutton%';

UPDATE products SET subcategory = 'Meat Masala'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%meat%';

UPDATE products SET subcategory = 'Egg Roast'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%egg roast%';

UPDATE products SET subcategory = 'Sambar Powder'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%sambar%';

UPDATE products SET subcategory = 'Rasam Powder'
WHERE category = 'Curry Masalas' AND LOWER(name) ILIKE '%rasam%';

UPDATE products SET subcategory = 'Biryani Masala'
WHERE category = 'Curry Masalas' AND (LOWER(name) ILIKE '%biriyani%' OR LOWER(name) ILIKE '%biryani%' OR LOWER(name) ILIKE '%briyani%');

-- Pickles subcategories
UPDATE products SET subcategory = 'Mango'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%mango%';

UPDATE products SET subcategory = 'Lime'
WHERE category = 'Pickles' AND (LOWER(name) ILIKE '%lime%' OR LOWER(name) ILIKE '%lemon%');

UPDATE products SET subcategory = 'Garlic'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%garlic%' AND LOWER(name) NOT ILIKE '%ginger%';

UPDATE products SET subcategory = 'Ginger'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%ginger%' AND LOWER(name) NOT ILIKE '%garlic%' AND LOWER(name) NOT ILIKE '%paste%';

UPDATE products SET subcategory = 'Fish'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%fish pickle%';

UPDATE products SET subcategory = 'Anchovy'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%anchovy%';

UPDATE products SET subcategory = 'Prawn'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%prawn%';

UPDATE products SET subcategory = 'Amla'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%amla%';

UPDATE products SET subcategory = 'Dates'
WHERE category = 'Pickles' AND LOWER(name) ILIKE '%dates%';

-- Cooking Essentials subcategories
UPDATE products SET subcategory = 'Salt'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%salt%';

UPDATE products SET subcategory = 'Sugar'
WHERE category = 'Cooking Essentials' AND (LOWER(name) ILIKE '%sugar%' OR LOWER(name) ILIKE '%jaggery%');

UPDATE products SET subcategory = 'Honey'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%honey%';

UPDATE products SET subcategory = 'Tamarind'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%tamarind%';

UPDATE products SET subcategory = 'Vinegar'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%vinegar%';

UPDATE products SET subcategory = 'Tomato Ketchup'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%ketchup%';

UPDATE products SET subcategory = 'Coconut Milk Powder'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%coconut milk%';

UPDATE products SET subcategory = 'Ginger Garlic Paste'
WHERE category = 'Cooking Essentials' AND (LOWER(name) ILIKE '%ginger garlic%' OR LOWER(name) ILIKE '%garlic ginger%' OR LOWER(name) ILIKE '%garlic%paste%' OR LOWER(name) ILIKE '%ginger%paste%');

UPDATE products SET subcategory = 'Curry Leaf Powder'
WHERE category = 'Cooking Essentials' AND LOWER(name) ILIKE '%curry%leaf%';

UPDATE products SET subcategory = 'Sauces'
WHERE category = 'Cooking Essentials' AND (LOWER(name) ILIKE '%sauce%' OR LOWER(name) ILIKE '%salad cream%');

-- Desserts subcategories
UPDATE products SET subcategory = 'Palada'
WHERE category = 'Desserts' AND (LOWER(name) ILIKE '%palada%' OR LOWER(name) ILIKE '%ada%');

UPDATE products SET subcategory = 'Vermicelli'
WHERE category = 'Desserts' AND (LOWER(name) ILIKE '%vermicelli%' OR LOWER(name) ILIKE '%semiya%');

UPDATE products SET subcategory = 'Payasam Mix'
WHERE category = 'Desserts' AND LOWER(name) ILIKE '%payasam%';

-- Ready to Eat subcategories
UPDATE products SET subcategory = 'Fish Curry'
WHERE category = 'Ready to Eat' AND (LOWER(name) ILIKE '%fish%curry%' OR LOWER(name) ILIKE '%fish curry%');

UPDATE products SET subcategory = 'Curries'
WHERE category = 'Ready to Eat' AND (
  LOWER(name) ILIKE '%curry%'
  OR LOWER(name) ILIKE '%roast%'
  OR LOWER(name) ILIKE '%thoran%'
  OR LOWER(name) ILIKE '%kootu%'
  OR LOWER(name) ILIKE '%kadala%'
  OR LOWER(name) ILIKE '%aviyal%'
  OR LOWER(name) ILIKE '%kappa%'
  OR LOWER(name) ILIKE '%puzhukku%'
  OR LOWER(name) ILIKE '%soya%'
) AND subcategory IS NULL;

UPDATE products SET subcategory = 'Rice Meals'
WHERE category = 'Ready to Eat' AND (LOWER(name) ILIKE '%rice%' OR LOWER(name) ILIKE '%biriyani%' OR LOWER(name) ILIKE '%biryani%') AND subcategory IS NULL;

UPDATE products SET subcategory = 'Noodles'
WHERE category = 'Ready to Eat' AND LOWER(name) ILIKE '%noodle%';

UPDATE products SET subcategory = 'Instant Meals'
WHERE category = 'Ready to Eat' AND (LOWER(name) ILIKE '%upma%' OR LOWER(name) ILIKE '%easy%') AND subcategory IS NULL;

UPDATE products SET subcategory = 'Ready Mixes'
WHERE category = 'Ready to Eat' AND (LOWER(name) ILIKE '%mix%' OR LOWER(name) ILIKE '%banana powder%' OR LOWER(name) ILIKE '%chilli podi%') AND subcategory IS NULL;

UPDATE products SET subcategory = 'Canned Fish'
WHERE category = 'Ready to Eat' AND (LOWER(name) ILIKE '%tuna%' OR LOWER(name) ILIKE '%light meat%') AND subcategory IS NULL;

-- Snacks subcategories
UPDATE products SET subcategory = 'Banana Chips'
WHERE category = 'Snacks' AND LOWER(name) ILIKE '%banana%';

UPDATE products SET subcategory = 'Jackfruit Chips'
WHERE category = 'Snacks' AND LOWER(name) ILIKE '%jackfruit%';

UPDATE products SET subcategory = 'Murukku'
WHERE category = 'Snacks' AND LOWER(name) ILIKE '%murukku%';

UPDATE products SET subcategory = 'Mixture'
WHERE category = 'Snacks' AND (LOWER(name) ILIKE '%mixture%' OR LOWER(name) ILIKE '%namkeen%' OR LOWER(name) ILIKE '%bhel%');

UPDATE products SET subcategory = 'Kuzhalappam'
WHERE category = 'Snacks' AND LOWER(name) ILIKE '%kuzhalappam%';

UPDATE products SET subcategory = 'Pakkavada'
WHERE category = 'Snacks' AND (LOWER(name) ILIKE '%pakkavada%' OR LOWER(name) ILIKE '%4 finger%' OR LOWER(name) ILIKE '%golden%');

UPDATE products SET subcategory = 'Dates'
WHERE category = 'Snacks' AND LOWER(name) ILIKE '%dates%';

-- Biscuits & Chocolates subcategories
UPDATE products SET subcategory = 'Cookies'
WHERE category = 'Biscuits & Chocolates' AND LOWER(name) ILIKE '%cookie%';

UPDATE products SET subcategory = 'Croissant'
WHERE category = 'Biscuits & Chocolates' AND LOWER(name) ILIKE '%croissant%';

UPDATE products SET subcategory = 'KitKat'
WHERE category = 'Biscuits & Chocolates' AND LOWER(name) ILIKE '%kitkat%';

UPDATE products SET subcategory = 'Cadbury'
WHERE category = 'Biscuits & Chocolates' AND (LOWER(name) ILIKE '%cadbury%' OR LOWER(name) ILIKE '%eclair%');

UPDATE products SET subcategory = 'Nutella'
WHERE category = 'Biscuits & Chocolates' AND (LOWER(name) ILIKE '%nutella%' OR LOWER(name) ILIKE '%hazelnut%spread%');

UPDATE products SET subcategory = 'Oreo'
WHERE category = 'Biscuits & Chocolates' AND LOWER(name) ILIKE '%oreo%';

UPDATE products SET subcategory = 'Cookies'
WHERE category = 'Biscuits & Chocolates' AND (LOWER(name) ILIKE '%biscuit%' OR LOWER(name) ILIKE '%choco%') AND subcategory IS NULL;

-- Tea, Coffee & Beverages subcategories
UPDATE products SET subcategory = 'Tea'
WHERE category = 'Tea, Coffee & Beverages' AND LOWER(name) ILIKE '%tea%' AND LOWER(name) NOT ILIKE '%green%';

UPDATE products SET subcategory = 'Green Tea'
WHERE category = 'Tea, Coffee & Beverages' AND LOWER(name) ILIKE '%green%';

UPDATE products SET subcategory = 'Coffee'
WHERE category = 'Tea, Coffee & Beverages' AND LOWER(name) ILIKE '%coffee%';

UPDATE products SET subcategory = 'Instant Coffee'
WHERE category = 'Tea, Coffee & Beverages' AND LOWER(name) ILIKE '%instant coffee%';

UPDATE products SET subcategory = 'Health Drinks'
WHERE category = 'Tea, Coffee & Beverages' AND (LOWER(name) ILIKE '%bournvita%' OR LOWER(name) ILIKE '%horlicks%');

UPDATE products SET subcategory = 'Breakfast Cereals'
WHERE category = 'Tea, Coffee & Beverages' AND (LOWER(name) ILIKE '%bran%' OR LOWER(name) ILIKE '%coco pops%' OR LOWER(name) ILIKE '%special k%');

-- Fryums subcategories
UPDATE products SET subcategory = 'Pappadam'
WHERE category = 'Fryums' AND LOWER(name) ILIKE '%pappadam%';

UPDATE products SET subcategory = 'Vadam'
WHERE category = 'Fryums' AND (LOWER(name) ILIKE '%vadam%' OR LOWER(name) ILIKE '%sago%');

UPDATE products SET subcategory = 'Fryums'
WHERE category = 'Fryums' AND LOWER(name) ILIKE '%tapioca%';

-- Personal Care subcategories
UPDATE products SET subcategory = 'Bath'
WHERE category = 'Personal Care' AND LOWER(name) ILIKE '%soap%';

UPDATE products SET subcategory = 'Oral Care'
WHERE category = 'Personal Care' AND (LOWER(name) ILIKE '%toothbrush%' OR LOWER(name) ILIKE '%cavity%');

UPDATE products SET subcategory = 'Skin Care'
WHERE category = 'Personal Care' AND (LOWER(name) ILIKE '%face%' OR LOWER(name) ILIKE '%skin%' OR LOWER(name) ILIKE '%cream%' OR LOWER(name) ILIKE '%lip%' OR LOWER(name) ILIKE '%scrub%');

UPDATE products SET subcategory = 'Feminine Care'
WHERE category = 'Personal Care' AND (LOWER(name) ILIKE '%night wings%' OR LOWER(name) ILIKE '%ultra day%');

-- Household subcategories
UPDATE products SET subcategory = 'Laundry'
WHERE category = 'Household' AND (
  LOWER(name) ILIKE '%pod%'
  OR LOWER(name) ILIKE '%powder%'
  OR LOWER(name) ILIKE '%liquid%'
  OR LOWER(name) ILIKE '%conditioner%'
  OR LOWER(name) ILIKE '%fabric%'
  OR LOWER(name) ILIKE '%power plus%'
);

UPDATE products SET subcategory = 'Cleaning'
WHERE category = 'Household' AND (
  LOWER(name) ILIKE '%scouring%'
  OR LOWER(name) ILIKE '%sponge%'
  OR LOWER(name) ILIKE '%refuse%'
  OR LOWER(name) ILIKE '%sack%'
);

UPDATE products SET subcategory = 'Air Fresheners'
WHERE category = 'Household' AND LOWER(name) ILIKE '%agarbathi%';

UPDATE products SET subcategory = 'Kitchen Essentials'
WHERE category = 'Household' AND subcategory IS NULL;
