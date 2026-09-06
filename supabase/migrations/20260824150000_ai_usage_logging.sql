-- ============================================================
-- AI USAGE LOGGING & DASHBOARD
-- Objective: Track OpenAI costs, usage frequency, and performance across features.
-- ============================================================

-- 1. AI Usage Log Table
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL, -- e.g., 'customer_care', 'competitor_matching', 'seo'
  model text NOT NULL,   -- e.g., 'gpt-4o', 'gpt-4o-mini'
  request_type text,    -- e.g., 'chat', 'tool_call', 'extraction'
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost numeric(10, 5),
  duration_ms integer,
  status text CHECK (status IN ('success', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 2. RLS Policies
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view AI logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING (true);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON public.ai_usage_logs(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.ai_usage_logs(created_at DESC);

-- 4. View for Dashboard Statistics
CREATE OR REPLACE VIEW public.ai_usage_stats AS
SELECT
  feature,
  model,
  COUNT(*) as total_calls,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost,
  AVG(duration_ms) as avg_duration_ms,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::numeric / COUNT(*) as failure_rate
FROM public.ai_usage_logs
GROUP BY feature, model;

COMMENT ON TABLE public.ai_usage_logs IS 'Tracks all OpenAI API calls for cost and performance auditing.';
