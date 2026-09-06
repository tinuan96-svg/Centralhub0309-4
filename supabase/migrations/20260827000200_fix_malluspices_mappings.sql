-- Fix and complete MalluSpices WhatsApp mappings

-- 1. Link existing NULL mappings to correct templates
UPDATE public.whatsapp_event_template_mappings m
SET
  template_id = tr.id,
  channel_id = wc.id,
  updated_at = now()
FROM public.whatsapp_template_registry tr
JOIN public.whatsapp_channels wc ON tr.store_id = wc.store_id
JOIN public.stores s ON tr.store_id = s.id
WHERE m.store_id = s.id
  AND m.event_key = 'order.confirmed'
  AND s.slug = 'malluspices'
  AND tr.meta_template_name = 'order_confirm_v1';

UPDATE public.whatsapp_event_template_mappings m
SET
  template_id = tr.id,
  channel_id = wc.id,
  updated_at = now()
FROM public.whatsapp_template_registry tr
JOIN public.whatsapp_channels wc ON tr.store_id = wc.store_id
JOIN public.stores s ON tr.store_id = s.id
WHERE m.store_id = s.id
  AND m.event_key = 'order.received'
  AND s.slug = 'malluspices'
  AND tr.meta_template_name = 'order_confirm_v1';

-- 2. Add missing operational mappings for MalluSpices
INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, template_id, channel_id, variables)
SELECT
  s.id, 'order.shipped', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Order Shipped', tr.id, wc.id, '["customer_name", "order_number", "tracking_url"]'::jsonb
FROM public.stores s
JOIN public.whatsapp_template_registry tr ON s.id = tr.store_id
JOIN public.whatsapp_channels wc ON s.id = wc.store_id
WHERE s.slug = 'malluspices' AND tr.meta_template_name = 'ship_update_v1'
ON CONFLICT (store_id, event_key) DO UPDATE SET template_id = EXCLUDED.template_id;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, template_id, channel_id, variables)
SELECT
  s.id, 'order.delivered', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Order Delivered', tr.id, wc.id, '["customer_name", "order_number"]'::jsonb
FROM public.stores s
JOIN public.whatsapp_template_registry tr ON s.id = tr.store_id
JOIN public.whatsapp_channels wc ON s.id = wc.store_id
WHERE s.slug = 'malluspices' AND tr.meta_template_name = 'order_delivered_v1'
ON CONFLICT (store_id, event_key) DO UPDATE SET template_id = EXCLUDED.template_id;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, template_id, channel_id, variables)
SELECT
  s.id, 'order.returned', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Order Returned', tr.id, wc.id, '["customer_name", "order_number"]'::jsonb
FROM public.stores s
JOIN public.whatsapp_template_registry tr ON s.id = tr.store_id
JOIN public.whatsapp_channels wc ON s.id = wc.store_id
WHERE s.slug = 'malluspices' AND tr.meta_template_name = 'order_returned_v1'
ON CONFLICT (store_id, event_key) DO UPDATE SET template_id = EXCLUDED.template_id;

-- 3. Template Catalog View (Template-Centric)
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
  tr.created_at,
  m.event_key as linked_event_key,
  m.enabled as is_mapping_enabled,
  t.status as meta_status,
  t.meta_template_id
FROM public.whatsapp_template_registry tr
LEFT JOIN public.whatsapp_event_template_mappings m ON tr.id = m.template_id
LEFT JOIN public.whatsapp_templates t ON (tr.store_id = t.store_id AND tr.meta_template_name = t.name);

GRANT SELECT ON public.whatsapp_template_catalog TO authenticated;

NOTIFY pgrst, 'reload schema';
