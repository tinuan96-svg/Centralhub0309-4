-- Analytics-only campaign link registry. Does not modify operational order/finance tables.
CREATE TABLE IF NOT EXISTS public.marketing_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  destination_url text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content text,
  utm_term text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_marketing_tracking_links_store_campaign
  ON public.marketing_tracking_links(store_id, campaign_id);

ALTER TABLE public.marketing_tracking_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_tracking_links_authenticated ON public.marketing_tracking_links;
CREATE POLICY marketing_tracking_links_authenticated
  ON public.marketing_tracking_links FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.analytics_build_tracking_url(
  p_destination_url text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  separator text := CASE WHEN position('?' IN p_destination_url) > 0 THEN '&' ELSE '?' END;
  result text := p_destination_url;
BEGIN
  result := result || separator
    || 'utm_source=' || replace(replace(replace(coalesce(p_utm_source,''),'%','%25'),' ','%20'),'&','%26')
    || '&utm_medium=' || replace(replace(replace(coalesce(p_utm_medium,''),'%','%25'),' ','%20'),'&','%26')
    || '&utm_campaign=' || replace(replace(replace(coalesce(p_utm_campaign,''),'%','%25'),' ','%20'),'&','%26');
  IF nullif(trim(p_utm_content),'') IS NOT NULL THEN result := result || '&utm_content=' || replace(replace(replace(trim(p_utm_content),'%','%25'),' ','%20'),'&','%26'); END IF;
  IF nullif(trim(p_utm_term),'') IS NOT NULL THEN result := result || '&utm_term=' || replace(replace(replace(trim(p_utm_term),'%','%25'),' ','%20'),'&','%26'); END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_build_tracking_url(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_build_tracking_url(text,text,text,text,text,text) TO authenticated;
