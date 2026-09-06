-- Remote-store compatibility: PocketGrocery product sync sends custom_attributes.
-- Keep this migration idempotent so it can also be applied when a remote store database is rebuilt.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
