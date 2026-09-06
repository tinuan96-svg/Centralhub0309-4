-- Harden Marketing OS tenant isolation. CentralHub is an internal control plane;
-- every store/company remains an independent tenant.

CREATE OR REPLACE FUNCTION public.centralhub_marketing_store_access(target_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.profile_role='admin' AND COALESCE(up.is_active,true))
    OR EXISTS (SELECT 1 FROM public.store_staff ss WHERE ss.user_id=auth.uid() AND ss.store_id=target_store_id AND ss.role IN ('admin','staff'))
  );
$$;
REVOKE ALL ON FUNCTION public.centralhub_marketing_store_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.centralhub_marketing_store_access(uuid) TO authenticated;

DO $$ DECLARE t text; p record; BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_segments','marketing_connections','marketing_assets','marketing_campaigns','marketing_metrics','marketing_events','marketing_sync_jobs','marketing_creatives','marketing_audiences','marketing_audience_sync','marketing_insights'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',p.policyname,t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "Marketing segments store isolation" ON public.marketing_segments FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing connections store isolation" ON public.marketing_connections FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing assets store isolation" ON public.marketing_assets FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing campaigns store isolation" ON public.marketing_campaigns FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing metrics store isolation" ON public.marketing_metrics FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing events store isolation" ON public.marketing_events FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing sync jobs store isolation" ON public.marketing_sync_jobs FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing creatives store isolation" ON public.marketing_creatives FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing audiences store isolation" ON public.marketing_audiences FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));
CREATE POLICY "Marketing audience sync store isolation" ON public.marketing_audience_sync FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.marketing_audiences a WHERE a.id=audience_id AND public.centralhub_marketing_store_access(a.store_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_audiences a WHERE a.id=audience_id AND public.centralhub_marketing_store_access(a.store_id)) AND EXISTS (SELECT 1 FROM public.marketing_connections c JOIN public.marketing_audiences a ON a.store_id=c.store_id WHERE c.id=connection_id AND a.id=audience_id));
CREATE POLICY "Marketing insights store isolation" ON public.marketing_insights FOR ALL TO authenticated USING (public.centralhub_marketing_store_access(store_id)) WITH CHECK (public.centralhub_marketing_store_access(store_id));

CREATE OR REPLACE FUNCTION public.validate_marketing_asset_store_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE connection_store uuid;
BEGIN SELECT store_id INTO connection_store FROM public.marketing_connections WHERE id=NEW.connection_id;
IF connection_store IS NULL OR connection_store<>NEW.store_id THEN RAISE EXCEPTION 'Marketing asset store_id must match connection store_id'; END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_validate_marketing_asset_store ON public.marketing_assets;
CREATE TRIGGER trg_validate_marketing_asset_store BEFORE INSERT OR UPDATE OF connection_id,store_id ON public.marketing_assets FOR EACH ROW EXECUTE FUNCTION public.validate_marketing_asset_store_match();

CREATE OR REPLACE FUNCTION public.validate_marketing_audience_connection_store_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE audience_store uuid; connection_store uuid;
BEGIN SELECT store_id INTO audience_store FROM public.marketing_audiences WHERE id=NEW.audience_id; SELECT store_id INTO connection_store FROM public.marketing_connections WHERE id=NEW.connection_id;
IF audience_store IS NULL OR connection_store IS NULL OR audience_store<>connection_store THEN RAISE EXCEPTION 'Marketing audience and connection must belong to the same store'; END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_validate_marketing_audience_connection_store ON public.marketing_audience_sync;
CREATE TRIGGER trg_validate_marketing_audience_connection_store BEFORE INSERT OR UPDATE OF audience_id,connection_id ON public.marketing_audience_sync FOR EACH ROW EXECUTE FUNCTION public.validate_marketing_audience_connection_store_match();
