-- Final schema cache refresh attempt
ALTER TABLE public.competitor_catalog_items ALTER COLUMN ai_used SET DEFAULT false;
NOTIFY pgrst, 'reload schema';
