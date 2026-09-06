-- Customer Care AI reliability: tickets, admin alerts, and realtime dashboard attention.

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject text;

CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  store_id uuid REFERENCES public.stores(id),
  title text NOT NULL,
  message text,
  severity text DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  category text NOT NULL,
  action_url text,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_notifications' AND policyname='Users can view their notifications') THEN
    CREATE POLICY "Users can view their notifications" ON public.system_notifications FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_notifications' AND policyname='Users can update their notifications') THEN
    CREATE POLICY "Users can update their notifications" ON public.system_notifications FOR UPDATE TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_conversation_status ON public.support_tickets(conversation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_notifications_support_unread ON public.system_notifications(store_id, is_read, created_at DESC) WHERE is_read = false AND category = 'support';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'system_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;
  END IF;
END $$;

UPDATE public.customer_care_settings
SET ai_auto_reply = true, updated_at = now()
WHERE ai_enabled = true AND COALESCE(default_handling_mode, 'AI') = 'AI';
