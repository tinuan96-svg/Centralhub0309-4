-- The legacy `http` extension was installed in public and is not relocatable.
-- CentralHub's live webhook/sync routines use pg_net (`net.http_*`) instead.
-- No live public function or cron job references the blocking `http_*` API,
-- so remove the unused extension rather than leaving extension-owned objects in public.

DROP EXTENSION IF EXISTS http;
