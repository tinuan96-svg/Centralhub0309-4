CREATE TABLE IF NOT EXISTS public.kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS public.kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.kb_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated staff can manage KB categories" ON public.kb_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated staff can manage KB articles" ON public.kb_articles FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_kb_categories_store ON public.kb_categories(store_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_store_published ON public.kb_articles(store_id, is_published);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON public.kb_articles(category_id);

INSERT INTO public.customer_care_settings (store_id, ai_enabled, ai_auto_reply, default_handling_mode)
SELECT s.id, true, true, 'AI'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_care_settings c WHERE c.store_id = s.id
);

NOTIFY pgrst, 'reload schema';
