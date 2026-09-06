-- migration: 20260819000004_competitor_discovery_system.sql
-- Description: AI-Powered Competitor Product Discovery System

-- 1. Enhance competitors table with discovery metadata
ALTER TABLE public.competitors
ADD COLUMN IF NOT EXISTS last_discovery_at timestamptz,
ADD COLUMN IF NOT EXISTS discovery_status text DEFAULT 'idle' CHECK (discovery_status IN ('idle', 'running', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS discovery_progress jsonb DEFAULT '{"total": 0, "processed": 0, "automatic": 0, "review": 0, "no_match": 0, "new_opportunities": 0, "errors": 0}',
ADD COLUMN IF NOT EXISTS discovery_error text;

-- 2. Enhance competitor_prices with source availability tracking
ALTER TABLE public.competitor_prices
ADD COLUMN IF NOT EXISTS source_status text DEFAULT 'active' CHECK (source_status IN ('active', 'unavailable')),
ADD COLUMN IF NOT EXISTS discovered_at timestamptz DEFAULT now();

-- 3. Create discovery_sessions table to track history of runs
CREATE TABLE IF NOT EXISTS public.competitor_discovery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  progress jsonb DEFAULT '{"total": 0, "processed": 0, "automatic": 0, "review": 0, "no_match": 0, "new_opportunities": 0, "errors": 0}',
  error text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  performed_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_competitor ON public.competitor_discovery_sessions(competitor_id);
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status ON public.competitor_discovery_sessions(status);

ALTER TABLE public.competitor_discovery_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competitor_discovery_sessions' AND policyname = 'admin_manage_discovery_sessions') THEN
        CREATE POLICY "admin_manage_discovery_sessions" ON public.competitor_discovery_sessions FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 4. Add discovery_session_id to audit logs
ALTER TABLE public.competitor_audit_logs ADD COLUMN IF NOT EXISTS discovery_session_id uuid REFERENCES public.competitor_discovery_sessions(id) ON DELETE SET NULL;

COMMENT ON TABLE public.competitor_discovery_sessions IS 'Tracks individual AI-powered catalog discovery runs for competitors.';
