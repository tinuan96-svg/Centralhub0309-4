-- Analytics-only migration. No operational order, finance, inventory, or customer tables are modified.
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS client_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_events_store_client_event ON public.analytics_events(store_id, client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_store_session_time ON public.analytics_events(store_id, session_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.analytics_touch_session(
  p_store_id uuid, p_session_key text, p_anonymous_id text, p_source text, p_medium text, p_campaign text,
  p_content text, p_term text, p_referrer text, p_landing_page text, p_last_seen_at timestamptz,
  p_event_name text, p_order_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.analytics_sessions(store_id,session_key,anonymous_id,source,medium,campaign,content,term,referrer,landing_page,started_at,last_seen_at,page_count,event_count,converted,order_id)
  VALUES(p_store_id,p_session_key,p_anonymous_id,p_source,p_medium,p_campaign,p_content,p_term,p_referrer,p_landing_page,p_last_seen_at,p_last_seen_at,CASE WHEN p_event_name='page_view' THEN 1 ELSE 0 END,1,p_event_name='purchase',p_order_id)
  ON CONFLICT(store_id,session_key) DO UPDATE SET
    anonymous_id=COALESCE(EXCLUDED.anonymous_id,analytics_sessions.anonymous_id),
    source=COALESCE(EXCLUDED.source,analytics_sessions.source), medium=COALESCE(EXCLUDED.medium,analytics_sessions.medium),
    campaign=COALESCE(EXCLUDED.campaign,analytics_sessions.campaign), content=COALESCE(EXCLUDED.content,analytics_sessions.content),
    term=COALESCE(EXCLUDED.term,analytics_sessions.term), referrer=COALESCE(EXCLUDED.referrer,analytics_sessions.referrer),
    landing_page=COALESCE(analytics_sessions.landing_page,EXCLUDED.landing_page), last_seen_at=GREATEST(analytics_sessions.last_seen_at,EXCLUDED.last_seen_at),
    page_count=analytics_sessions.page_count+CASE WHEN p_event_name='page_view' THEN 1 ELSE 0 END,
    event_count=analytics_sessions.event_count+1,
    converted=analytics_sessions.converted OR p_event_name='purchase', order_id=COALESCE(EXCLUDED.order_id,analytics_sessions.order_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.analytics_touch_session(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_touch_session(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text,uuid) TO service_role;