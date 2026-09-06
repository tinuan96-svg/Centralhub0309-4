/*
  # Per-Store Storage Buckets

  ## Summary
  Adds infrastructure for each store to have its own dedicated storage bucket for
  product images. This allows stores to manage images independently without sharing
  a single global bucket.

  ## New Tables
  - `store_storage_buckets` — tracks which Supabase Storage bucket belongs to each store

  ## Modified Tables
  - `stores` — adds `bucket_name` column (text, nullable) that stores the name of
    the store's dedicated storage bucket once provisioned

  ## Notes
  - Supabase Storage buckets are provisioned by the application (not SQL), so the
    SQL layer only tracks the bucket name string here.
  - The `store_storage_buckets` table stores metadata: bucket_name, is_public flag,
    and created_at timestamp.
  - RLS is enforced: only authenticated (admin) users can read/write bucket records.
*/

-- 1. Add bucket_name column to stores table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'bucket_name'
  ) THEN
    ALTER TABLE stores ADD COLUMN bucket_name text;
  END IF;
END $$;

-- 2. Create store_storage_buckets metadata table
CREATE TABLE IF NOT EXISTS store_storage_buckets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bucket_name    text NOT NULL UNIQUE,
  is_public      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. Unique constraint: one bucket per store
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'store_storage_buckets'
      AND constraint_name = 'store_storage_buckets_store_id_key'
  ) THEN
    ALTER TABLE store_storage_buckets ADD CONSTRAINT store_storage_buckets_store_id_key UNIQUE (store_id);
  END IF;
END $$;

-- 4. Index for fast lookup by store_id
CREATE INDEX IF NOT EXISTS idx_store_storage_buckets_store_id ON store_storage_buckets(store_id);

-- 5. Enable RLS
ALTER TABLE store_storage_buckets ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies — authenticated users only (admin app)
CREATE POLICY "Authenticated users can read store buckets"
  ON store_storage_buckets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert store buckets"
  ON store_storage_buckets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update store buckets"
  ON store_storage_buckets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete store buckets"
  ON store_storage_buckets FOR DELETE
  TO authenticated
  USING (true);
