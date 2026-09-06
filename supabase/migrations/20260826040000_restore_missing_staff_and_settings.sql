-- Restore critical missing tables for Customer Care and Staff Access

-- 1. Store Staff Assignments
CREATE TABLE IF NOT EXISTS public.store_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, user_id)
);

-- 2. Customer Care AI Settings
CREATE TABLE IF NOT EXISTS public.customer_care_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  ai_enabled boolean DEFAULT true,
  ai_auto_reply boolean DEFAULT false,
  default_handling_mode text DEFAULT 'AI' CHECK (default_handling_mode IN ('AI', 'AI_DRAFT', 'HUMAN')),
  greeting_message text,
  custom_knowledge text,
  escalation_rules jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Security
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_care_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff" ON public.store_staff FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can view settings" ON public.customer_care_settings FOR ALL TO authenticated USING (true);

-- Seed Staff for the primary admin if stores exist
INSERT INTO public.store_staff (store_id, user_id, role)
SELECT s.id, 'cd34659f-ee97-4176-9108-a788e80a5e4a', 'admin'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_staff
  WHERE user_id = 'cd34659f-ee97-4176-9108-a788e80a5e4a' AND store_id = s.id
);

NOTIFY pgrst, 'reload schema';
