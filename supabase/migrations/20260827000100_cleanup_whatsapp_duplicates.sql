-- Cleanup and Consolidation of WhatsApp Automations
-- Ensures exactly one active mapping for each event per store

-- 1. Remove underscored event keys (legacy from partial implementation)
DELETE FROM public.whatsapp_event_template_mappings
WHERE event_key LIKE '%\_%';

-- 2. Consolidate dot-notated duplicates (keep the one with a template_id, or the most recent)
WITH ranked_mappings AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY store_id, event_key
           ORDER BY (template_id IS NOT NULL) DESC, updated_at DESC
         ) as rank
  FROM public.whatsapp_event_template_mappings
)
DELETE FROM public.whatsapp_event_template_mappings
WHERE id IN (SELECT id FROM ranked_mappings WHERE rank > 1);

-- 3. Enforce Uniqueness at the database level
-- This prevents the "Two Cards" problem from ever returning
ALTER TABLE public.whatsapp_event_template_mappings
DROP CONSTRAINT IF EXISTS whatsapp_event_template_mappings_store_id_event_key_key;

ALTER TABLE public.whatsapp_event_template_mappings
ADD CONSTRAINT whatsapp_event_template_mappings_store_id_event_key_key
UNIQUE (store_id, event_key);

-- 4. Correctly link MalluSpices OTP Mapping to Template & Channel
-- This fixes the "NULL" issue found in the audit
UPDATE public.whatsapp_event_template_mappings m
SET
  template_id = tr.id,
  channel_id = wc.id,
  variables = '["otp_code"]'::jsonb
FROM public.whatsapp_template_registry tr
JOIN public.whatsapp_channels wc ON tr.store_id = wc.store_id
JOIN public.stores s ON tr.store_id = s.id
WHERE m.store_id = s.id
  AND m.event_key = 'account.login.otp'
  AND s.slug = 'malluspices'
  AND tr.name ILIKE '%OTP%';

-- 5. Final Catalog Refresh
NOTIFY pgrst, 'reload schema';
