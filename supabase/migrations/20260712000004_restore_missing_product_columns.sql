-- ============================================================
-- RESTORE MISSING PRODUCT COLUMNS
-- Adds image_url and description back to the products table
-- ============================================================

DO $$
BEGIN
    -- 1. image_url (Essential for standard ecommerce)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN
        ALTER TABLE public.products ADD COLUMN image_url text DEFAULT '';
    END IF;

    -- 2. description (Essential for standard ecommerce)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'description') THEN
        ALTER TABLE public.products ADD COLUMN description text DEFAULT '';
    END IF;

    -- 3. gallery_images (Array of image URLs)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gallery_images') THEN
        ALTER TABLE public.products ADD COLUMN gallery_images text[];
    END IF;

END $$;

COMMENT ON COLUMN public.products.image_url IS 'Primary product image URL';
COMMENT ON COLUMN public.products.description IS 'Detailed product description';
COMMENT ON COLUMN public.products.gallery_images IS 'Array of additional product image URLs';
