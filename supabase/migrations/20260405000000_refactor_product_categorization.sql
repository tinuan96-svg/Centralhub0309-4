-- 1. Add new columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- 2. Migration Script: Intelligent Keyword Mapping
DO $$
BEGIN
    -- Initialize with default values to ensure no NULLs
    UPDATE products SET
        department = 'Dry Foods',
        category = 'Cooking Essentials',
        subcategory = 'General'
    WHERE department IS NULL;

    ------------------------------------
    -- DRY FOODS
    ------------------------------------

    -- Rice
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Basmati Rice' WHERE name ILIKE '%basmati%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Matta Rice' WHERE name ILIKE '%matta%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Ponni Rice' WHERE name ILIKE '%ponni%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Jaya Rice' WHERE name ILIKE '%jaya%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Idli Rice' WHERE name ILIKE '%idli rice%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Jeerakasala Rice' WHERE name ILIKE '%jeerakasala%' OR name ILIKE '%khaima%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Raw Rice' WHERE name ILIKE '%raw rice%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Boiled Rice' WHERE name ILIKE '%boiled rice%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice', subcategory = 'Broken Rice' WHERE name ILIKE '%broken rice%';
    UPDATE products SET department = 'Dry Foods', category = 'Rice' WHERE (name ILIKE '%rice%' OR unit ILIKE '%rice%') AND category = 'Cooking Essentials';

    -- Flour & Grains
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Puttu Podi' WHERE name ILIKE '%puttu%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Appam Podi' WHERE name ILIKE '%appam%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Idiyappam Podi' WHERE name ILIKE '%idiyappam%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Pathiri Podi' WHERE name ILIKE '%pathiri%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Dosa Mix' WHERE name ILIKE '%dosa%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Idli Mix' WHERE name ILIKE '%idli mix%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Rice Flour' WHERE name ILIKE '%rice flour%' OR name ILIKE '%rice powder%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Atta' WHERE name ILIKE '%atta%' OR name ILIKE '%wheat flour%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Gram Flour' WHERE name ILIKE '%gram flour%' OR name ILIKE '%besan%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Ragi Powder' WHERE name ILIKE '%ragi%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Aval' WHERE name ILIKE '%aval%' OR name ILIKE '%poha%';
    UPDATE products SET department = 'Dry Foods', category = 'Flour & Grains', subcategory = 'Semolina' WHERE name ILIKE '%semolina%' OR name ILIKE '%rava%' OR name ILIKE '%sooji%';

    -- Spices (Whole vs Ground)
    UPDATE products SET department = 'Dry Foods', category = 'Whole Spices'
    WHERE name ILIKE '%pepper%' OR name ILIKE '%cardamom%' OR name ILIKE '%clove%' OR name ILIKE '%mustard%'
    OR name ILIKE '%jeera%' OR name ILIKE '%fennel%' OR name ILIKE '%bay leaf%' OR name ILIKE '%star anise%' OR name ILIKE '%nutmeg%';

    UPDATE products SET department = 'Dry Foods', category = 'Ground Spices'
    WHERE name ILIKE '%powder%' AND (name ILIKE '%chilli%' OR name ILIKE '%turmeric%' OR name ILIKE '%coriander%' OR name ILIKE '%pepper%' OR name ILIKE '%cinnamon%' OR name ILIKE '%fenugreek%');

    -- Curry Masalas
    UPDATE products SET department = 'Dry Foods', category = 'Curry Masalas'
    WHERE name ILIKE '%masala%' OR name ILIKE '%sambar%' OR name ILIKE '%rasam%' OR name ILIKE '%biryani%' OR name ILIKE '%roast%' OR name ILIKE '%65%' OR name ILIKE '%fry%';

    -- Pickles
    UPDATE products SET department = 'Dry Foods', category = 'Pickles' WHERE name ILIKE '%pickle%';
    UPDATE products SET subcategory = 'Mango' WHERE category = 'Pickles' AND name ILIKE '%mango%';
    UPDATE products SET subcategory = 'Lime' WHERE category = 'Pickles' AND name ILIKE '%lime%';
    UPDATE products SET subcategory = 'Garlic' WHERE category = 'Pickles' AND name ILIKE '%garlic%';
    UPDATE products SET subcategory = 'Fish' WHERE category = 'Pickles' AND name ILIKE '%fish%';

    -- Oils & Ghee
    UPDATE products SET department = 'Dry Foods', category = 'Oils & Ghee' WHERE name ILIKE '%oil%' OR name ILIKE '%ghee%';
    UPDATE products SET subcategory = 'Coconut Oil' WHERE category = 'Oils & Ghee' AND name ILIKE '%coconut%';
    UPDATE products SET subcategory = 'Sunflower Oil' WHERE category = 'Oils & Ghee' AND name ILIKE '%sunflower%';
    UPDATE products SET subcategory = 'Ghee' WHERE category = 'Oils & Ghee' AND name ILIKE '%ghee%';

    -- Desserts
    UPDATE products SET department = 'Dry Foods', category = 'Desserts'
    WHERE name ILIKE '%palada%' OR name ILIKE '%ada%' OR name ILIKE '%vermicelli%' OR name ILIKE '%payasam%' OR name ILIKE '%semiya%';

    -- Snacks & Biscuits
    UPDATE products SET department = 'Dry Foods', category = 'Snacks'
    WHERE name ILIKE '%chips%' OR name ILIKE '%murukku%' OR name ILIKE '%mixture%' OR name ILIKE '%kuzhalappam%' OR name ILIKE '%pakkavada%';
    UPDATE products SET department = 'Dry Foods', category = 'Biscuits & Chocolates'
    WHERE name ILIKE '%biscuit%' OR name ILIKE '%chocolate%' OR name ILIKE '%oreo%' OR name ILIKE '%kitkat%' OR name ILIKE '%cookies%' OR name ILIKE '%nutella%' OR name ILIKE '%cadbury%';

    -- Tea, Coffee & Beverages
    UPDATE products SET department = 'Dry Foods', category = 'Tea, Coffee & Beverages'
    WHERE name ILIKE '%tea%' OR name ILIKE '%coffee%' OR name ILIKE '%horlicks%' OR name ILIKE '%boost%' OR name ILIKE '%bournvita%' OR name ILIKE '%cereal%';

    -- Ready to Eat
    UPDATE products SET department = 'Dry Foods', category = 'Ready to Eat'
    WHERE name ILIKE '%ready to eat%' OR name ILIKE '%instant%' OR name ILIKE '%noodle%' OR name ILIKE '%canned%';

    -- Fryums
    UPDATE products SET department = 'Dry Foods', category = 'Fryums'
    WHERE name ILIKE '%pappadam%' OR name ILIKE '%vadam%' OR name ILIKE '%fryums%';

    ------------------------------------
    -- FROZEN FOODS
    ------------------------------------
    UPDATE products SET department = 'Frozen Foods' WHERE name ILIKE '%frozen%' OR unit ILIKE '%frozen%';
    UPDATE products SET category = 'Frozen Seafood' WHERE department = 'Frozen Foods' AND (name ILIKE '%fish%' OR name ILIKE '%prawn%' OR name ILIKE '%shrimp%' OR name ILIKE '%squid%');
    UPDATE products SET category = 'Frozen Meat' WHERE department = 'Frozen Foods' AND (name ILIKE '%chicken%' OR name ILIKE '%meat%' OR name ILIKE '%beef%' OR name ILIKE '%mutton%' OR name ILIKE '%pork%');
    UPDATE products SET category = 'Frozen Vegetables' WHERE department = 'Frozen Foods' AND (name ILIKE '%veg%' OR name ILIKE '%pea%' OR name ILIKE '%corn%' OR name ILIKE '%spinach%');
    UPDATE products SET category = 'Frozen Snacks' WHERE department = 'Frozen Foods' AND (name ILIKE '%nugget%' OR name ILIKE '%samosa%' OR name ILIKE '%spring roll%');

    ------------------------------------
    -- FRESH FOODS
    ------------------------------------
    UPDATE products SET department = 'Fresh Foods' WHERE unit ILIKE '%fresh%' OR name ILIKE '%fresh%';
    UPDATE products SET category = 'Vegetables' WHERE department = 'Fresh Foods' AND (name ILIKE '%onion%' OR name ILIKE '%tomato%' OR name ILIKE '%potato%' OR name ILIKE '%chilli%' OR name ILIKE '%carrot%' OR name ILIKE '%cabbage%');
    UPDATE products SET category = 'Fruits' WHERE department = 'Fresh Foods' AND (name ILIKE '%apple%' OR name ILIKE '%banana%' OR name ILIKE '%orange%' OR name ILIKE '%grape%' OR name ILIKE '%mango%' OR name ILIKE '%lemon%');
    UPDATE products SET category = 'Herbs' WHERE department = 'Fresh Foods' AND (name ILIKE '%coriander%' OR name ILIKE '%mint%' OR name ILIKE '%curry leaf%' OR name ILIKE '%parsley%');

    ------------------------------------
    -- DAIRY & CHILLED
    ------------------------------------
    UPDATE products SET department = 'Dairy & Chilled'
    WHERE name ILIKE '%milk%' OR name ILIKE '%curd%' OR name ILIKE '%yogurt%' OR name ILIKE '%butter%' OR name ILIKE '%cheese%' OR name ILIKE '%paneer%' OR name ILIKE '%cream%';
    UPDATE products SET category = 'Milk' WHERE department = 'Dairy & Chilled' AND name ILIKE '%milk%';
    UPDATE products SET category = 'Paneer & Cheese' WHERE department = 'Dairy & Chilled' AND (name ILIKE '%paneer%' OR name ILIKE '%cheese%');

    ------------------------------------
    -- HOUSEHOLD
    ------------------------------------
    UPDATE products SET department = 'Household'
    WHERE name ILIKE '%detergent%' OR name ILIKE '%soap%' OR name ILIKE '%cleaner%' OR name ILIKE '%dish%' OR name ILIKE '%air freshener%' OR unit ILIKE '%household%' OR unit ILIKE '%cleaning%';
    UPDATE products SET category = 'Laundry' WHERE department = 'Household' AND (name ILIKE '%detergent%' OR name ILIKE '%wash%' OR name ILIKE '%surf%' OR name ILIKE '%comfort%');
    UPDATE products SET category = 'Cleaning' WHERE department = 'Household' AND (name ILIKE '%cleaner%' OR name ILIKE '%mop%' OR name ILIKE '%broom%' OR name ILIKE '%harpic%' OR name ILIKE '%dettol%');
    UPDATE products SET category = 'Kitchen Essentials' WHERE department = 'Household' AND (name ILIKE '%foil%' OR name ILIKE '%towel%' OR name ILIKE '%sponge%' OR name ILIKE '%scrub%');

    ------------------------------------
    -- PERSONAL CARE
    ------------------------------------
    UPDATE products SET department = 'Personal Care'
    WHERE name ILIKE '%shampoo%' OR name ILIKE '%toothpaste%' OR name ILIKE '%skin%' OR name ILIKE '%baby%' OR name ILIKE '%feminine%' OR unit ILIKE '%personal care%' OR unit ILIKE '%health%';
    UPDATE products SET category = 'Hair Care' WHERE department = 'Personal Care' AND (name ILIKE '%shampoo%' OR name ILIKE '%oil%' OR name ILIKE '%conditioner%');
    UPDATE products SET category = 'Oral Care' WHERE department = 'Personal Care' AND (name ILIKE '%toothpaste%' OR name ILIKE '%brush%' OR name ILIKE '%mouthwash%');
    UPDATE products SET category = 'Bath' WHERE department = 'Personal Care' AND (name ILIKE '%soap%' OR name ILIKE '%shower gel%' OR name ILIKE '%body wash%');

END $$;
