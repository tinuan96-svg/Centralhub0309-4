-- MASTER WHATSAPP CLEANUP & FINALIZATION
-- This script ensures exactly one authoritative set of templates and mappings for MalluSpices

-- 1. Remove any mapping with underscored keys (legacy)
DELETE FROM public.whatsapp_event_template_mappings WHERE event_key LIKE '%\_%';

-- 2. Consolidate Template Registry for MalluSpices
-- Some duplicate 'Order Confirmation' might exist from different migration versions
WITH registry_ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY store_id, meta_template_name, language
           ORDER BY created_at DESC
         ) as rank
  FROM public.whatsapp_template_registry
  WHERE store_id = '00000000-0000-0000-0000-000000000001'
)
DELETE FROM public.whatsapp_template_registry
WHERE id IN (SELECT id FROM registry_ranked WHERE rank > 1);

-- 3. Link MalluSpices Mappings to Canonical IDs
-- This fixes the "NULL" template_id and channel_id issue
DO $$
DECLARE
    v_store_id uuid := '00000000-0000-0000-0000-000000000001';
    v_channel_id uuid;
BEGIN
    -- Get MalluSpices Channel
    SELECT id INTO v_channel_id FROM public.whatsapp_channels WHERE store_id = v_store_id LIMIT 1;

    -- Update account.login.otp
    UPDATE public.whatsapp_event_template_mappings
    SET template_id = (SELECT id FROM public.whatsapp_template_registry WHERE store_id = v_store_id AND meta_template_name = 'malluspices_auth_otp_v1' LIMIT 1),
        channel_id = v_channel_id,
        variables = '["otp_code"]'::jsonb
    WHERE store_id = v_store_id AND event_key = 'account.login.otp';

    -- Update order.confirmed
    UPDATE public.whatsapp_event_template_mappings
    SET template_id = (SELECT id FROM public.whatsapp_template_registry WHERE store_id = v_store_id AND meta_template_name = 'order_confirm_v1' LIMIT 1),
        channel_id = v_channel_id,
        variables = '["customer_name", "order_number"]'::jsonb
    WHERE store_id = v_store_id AND event_key = 'order.confirmed';

    -- Update order.received (Map to confirmation for now as fallback)
    UPDATE public.whatsapp_event_template_mappings
    SET template_id = (SELECT id FROM public.whatsapp_template_registry WHERE store_id = v_store_id AND meta_template_name = 'order_confirm_v1' LIMIT 1),
        channel_id = v_channel_id
    WHERE store_id = v_store_id AND event_key = 'order.received';
END $$;

-- 4. Create authoritative view
CREATE OR REPLACE VIEW public.whatsapp_template_catalog AS
SELECT
  tr.id,
  tr.store_id,
  tr.name,
  tr.meta_template_name,
  tr.category,
  tr.language,
  tr.status as registry_status,
  tr.variables,
  m.event_key as linked_event_key,
  m.enabled as is_mapping_enabled,
  t.status as meta_status,
  t.meta_template_id
FROM public.whatsapp_template_registry tr
LEFT JOIN public.whatsapp_event_template_mappings m ON tr.id = m.template_id
LEFT JOIN public.whatsapp_templates t ON (tr.store_id = t.store_id AND tr.meta_template_name = t.name);

GRANT SELECT ON public.whatsapp_template_catalog TO authenticated;

NOTIFY pgrst, 'reload schema';
