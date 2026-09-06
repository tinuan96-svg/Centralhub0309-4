/*
# Fix Product Sync Chain - 3 Critical Bugs

## Summary
This migration fixes three bugs that prevent CentralHub from syncing product changes
(price, stock, brand, etc.) to remote stores (KeralaGrocery, MallusPices, PocketGrocery).

## Changes

### 1. Fix trigger_product_sync() function
- Bug: `SELECT id INTO v_request_id FROM net.http_post(...)` fails because
  net.http_post returns a bigint, not a record with an `id` column.
- Fix: Use `v_request_id := net.http_post(...)` instead.
- This allows the pg_cron job to successfully trigger the centralhub-product-sync
  edge function every 5 minutes.

### 2. Add missing columns to products table
- The centralhub-product-sync edge function orders by `updated_at` which doesn't exist.
- The `get_admin_products` RPC function references `image_url`, `image_main`,
  `gallery_images`, `description`, `original_price`, `profit_margin_percent`,
  `is_deal`, `allow_backorder`, `seo_title`, `seo_meta_description`,
  `source_product_id`, `sync_status`, `approval_status`, `approved_at`, `synced_at`
  which also don't exist.
- These missing columns cause PostgREST errors when the edge function tries to
  query the products table.
- Fix: Add all missing columns as nullable types with sensible defaults.

### 3. Add updated_at trigger
- Add an auto-updating `updated_at` column so the edge function's
  `.order("updated_at", { ascending: false })` works correctly and
  the most recently modified products are synced first.

## Security
- No RLS policy changes.
- No new tables.
- All new columns are nullable with defaults, so existing data is not affected.
*/

-- ============================================================
-- 1. Fix trigger_product_sync() function
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_product_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_function_url text;
  v_anon_key text;
  v_request_id bigint;
BEGIN
  v_function_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-product-sync';

  -- Get the anon key from vault
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_ANON_KEY'
  LIMIT 1;

  IF v_anon_key IS NULL THEN
    v_anon_key := '';
  END IF;

  -- Make the HTTP POST request (net.http_post returns bigint, not a record)
  v_request_id := net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('action', 'poll')
  );

  -- Log that we triggered the sync
  INSERT INTO public.sync_logs ("table", record_id, action, success, duration, error)
  VALUES ('products', 'scheduled', 'cron_trigger', true, 0, null);
END;
$$;

-- ============================================================
-- 2. Add missing columns to products table
-- ============================================================
DO $$
BEGIN
  -- updated_at (used by edge function for ordering)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'updated_at') THEN
    ALTER TABLE public.products ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- image_url (referenced by get_admin_products and other functions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'image_url') THEN
    ALTER TABLE public.products ADD COLUMN image_url text;
  END IF;

  -- image_main
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'image_main') THEN
    ALTER TABLE public.products ADD COLUMN image_main text;
  END IF;

  -- gallery_images
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'gallery_images') THEN
    ALTER TABLE public.products ADD COLUMN gallery_images jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'description') THEN
    ALTER TABLE public.products ADD COLUMN description text;
  END IF;

  -- original_price
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'original_price') THEN
    ALTER TABLE public.products ADD COLUMN original_price numeric(10,2);
  END IF;

  -- profit_margin_percent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'profit_margin_percent') THEN
    ALTER TABLE public.products ADD COLUMN profit_margin_percent numeric(5,2);
  END IF;

  -- is_deal
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'is_deal') THEN
    ALTER TABLE public.products ADD COLUMN is_deal boolean DEFAULT false;
  END IF;

  -- allow_backorder (note: 'backorder' already exists, this is a separate field)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'allow_backorder') THEN
    ALTER TABLE public.products ADD COLUMN allow_backorder boolean DEFAULT false;
  END IF;

  -- seo_title
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'seo_title') THEN
    ALTER TABLE public.products ADD COLUMN seo_title text;
  END IF;

  -- seo_meta_description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'seo_meta_description') THEN
    ALTER TABLE public.products ADD COLUMN seo_meta_description text;
  END IF;

  -- source_product_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'source_product_id') THEN
    ALTER TABLE public.products ADD COLUMN source_product_id text;
  END IF;

  -- sync_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'sync_status') THEN
    ALTER TABLE public.products ADD COLUMN sync_status text DEFAULT 'pending';
  END IF;

  -- approval_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'approval_status') THEN
    ALTER TABLE public.products ADD COLUMN approval_status text DEFAULT 'approved';
  END IF;

  -- approved_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'approved_at') THEN
    ALTER TABLE public.products ADD COLUMN approved_at timestamptz;
  END IF;

  -- synced_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'synced_at') THEN
    ALTER TABLE public.products ADD COLUMN synced_at timestamptz;
  END IF;

  -- sale_price (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'sale_price') THEN
    ALTER TABLE public.products ADD COLUMN sale_price numeric(10,2);
  END IF;

  -- is_published (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'is_published') THEN
    ALTER TABLE public.products ADD COLUMN is_published boolean DEFAULT true;
  END IF;

  -- is_archived (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'is_archived') THEN
    ALTER TABLE public.products ADD COLUMN is_archived boolean DEFAULT false;
  END IF;

  -- brand_id (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'brand_id') THEN
    ALTER TABLE public.products ADD COLUMN brand_id uuid;
  END IF;

  -- tags (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'tags') THEN
    ALTER TABLE public.products ADD COLUMN tags text[];
  END IF;

  -- custom_attributes (used by edge function mapProductForRemote)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'custom_attributes') THEN
    ALTER TABLE public.products ADD COLUMN custom_attributes jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- is_deleted (referenced by get_admin_products and visibility functions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'is_deleted') THEN
    ALTER TABLE public.products ADD COLUMN is_deleted boolean DEFAULT false;
  END IF;

  -- category_id (referenced by get_admin_products and sync functions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'category_id') THEN
    ALTER TABLE public.products ADD COLUMN category_id uuid;
  END IF;
END $$;

-- ============================================================
-- 3. Add auto-updating trigger for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_products_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at();

-- Set updated_at for all existing products
UPDATE public.products SET updated_at = now() WHERE updated_at IS NULL;

-- ============================================================
-- 4. Add foreign key from products.brand_id to brands(id) if brands table exists
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_id_fkey' AND conrelid::regclass::text = 'products') THEN
      ALTER TABLE public.products 
      ADD CONSTRAINT products_brand_id_fkey 
      FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 5. Add foreign key from products.category_id to categories(id) if categories table exists
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey' AND conrelid::regclass::text = 'products') THEN
      ALTER TABLE public.products 
      ADD CONSTRAINT products_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. Add index on updated_at for the edge function's ordering
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products (updated_at DESC);

-- ============================================================
-- 7. Notify PostgREST to reload its schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
