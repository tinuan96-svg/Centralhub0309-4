ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE products SET created_at = updated_at WHERE created_at IS NULL AND updated_at IS NOT NULL;
UPDATE products SET created_at = now() WHERE created_at IS NULL;
