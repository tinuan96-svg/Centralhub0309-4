-- CentralHub is a private control plane for independent companies.
-- External marketing assets and metrics must never cross store boundaries.

CREATE OR REPLACE FUNCTION public.enforce_marketing_store_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_store uuid;
BEGIN
  IF TG_TABLE_NAME = 'marketing_assets' THEN
    SELECT store_id INTO parent_store FROM public.marketing_connections WHERE id = NEW.connection_id;
    IF parent_store IS NULL OR parent_store <> NEW.store_id THEN
      RAISE EXCEPTION 'Marketing asset connection/store mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'marketing_audience_sync' THEN
    SELECT store_id INTO parent_store FROM public.marketing_connections WHERE id = NEW.connection_id;
    IF parent_store IS NULL THEN
      RAISE EXCEPTION 'Marketing audience sync connection not found';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.marketing_audiences a
      WHERE a.id = NEW.audience_id AND a.store_id = parent_store
    ) THEN
      RAISE EXCEPTION 'Marketing audience/connection store mismatch';
    END IF;
  ELSIF TG_TABLE_NAME = 'marketing_metrics' AND NEW.campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.marketing_campaigns c
      WHERE c.id = NEW.campaign_id AND c.store_id = NEW.store_id
    ) THEN
      RAISE EXCEPTION 'Marketing metric campaign/store mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_assets_store_boundary ON public.marketing_assets;
CREATE TRIGGER trg_marketing_assets_store_boundary
BEFORE INSERT OR UPDATE OF connection_id, store_id ON public.marketing_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_marketing_store_boundary();

DROP TRIGGER IF EXISTS trg_marketing_audience_sync_store_boundary ON public.marketing_audience_sync;
CREATE TRIGGER trg_marketing_audience_sync_store_boundary
BEFORE INSERT OR UPDATE OF audience_id, connection_id ON public.marketing_audience_sync
FOR EACH ROW EXECUTE FUNCTION public.enforce_marketing_store_boundary();

DROP TRIGGER IF EXISTS trg_marketing_metrics_store_boundary ON public.marketing_metrics;
CREATE TRIGGER trg_marketing_metrics_store_boundary
BEFORE INSERT OR UPDATE OF campaign_id, store_id ON public.marketing_metrics
FOR EACH ROW EXECUTE FUNCTION public.enforce_marketing_store_boundary();

-- Existing rows are intentionally not rewritten by this migration. The trigger
-- prevents new cross-store records while allowing a controlled data-cleanup pass.
