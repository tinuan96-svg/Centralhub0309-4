-- Cleanup contaminated competitor data
-- Removes items that are clearly UI buttons or labels instead of products

-- 1. Ensure competitor_prices has the source_product_name column (re-run logic from v2 migration if it missed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_product_name') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_product_name text;
    END IF;
END $$;

-- 2. Remove obvious junk from catalog items
DELETE FROM public.competitor_catalog_items
WHERE lower(name) IN (
    'add to cart', 'buy now', 'out of stock', 'in stock', 'quick view',
    'wishlist', 'view', 'basket', 'my account', 'checkout'
)
OR lower(name) LIKE '%add to cart%' AND length(name) < 30
OR name ~ '^[£$€]\s*\d+';

-- 3. Clean up contaminated names in catalog items
UPDATE public.competitor_catalog_items
SET name = trim(regexp_replace(
    regexp_replace(
        regexp_replace(name, 'add to cart', '', 'ig'),
        '\d+%\s*off', '', 'ig'
    ),
    '(price|regular price|sale price)?\s*[£\$€]\s*\d+(\.\d+)?', '', 'ig'
))
WHERE name ~* 'add to cart' OR name ~* 'off' OR name ~ '[£\$€]';

-- 4. Also clean competitor_prices table
UPDATE public.competitor_prices
SET source_product_name = trim(regexp_replace(
    regexp_replace(
        regexp_replace(source_product_name, 'add to cart', '', 'ig'),
        '\d+%\s*off', '', 'ig'
    ),
    '(price|regular price|sale price)?\s*[£\$€]\s*\d+(\.\d+)?', '', 'ig'
))
WHERE source_product_name IS NOT NULL AND (source_product_name ~* 'add to cart' OR source_product_name ~* 'off' OR source_product_name ~ '[£\$€]');
