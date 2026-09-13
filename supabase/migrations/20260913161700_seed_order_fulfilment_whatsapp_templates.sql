-- Seed MalluSpices utility templates for the operational fulfilment stages.
-- Rules stay disabled while Meta approval is pending; whatsapp-template-sync promotes
-- each rule automatically when the matching template becomes APPROVED.
DO $$
DECLARE
  v_store_id uuid;
  v_channel_id uuid;
BEGIN
  SELECT s.id, c.id
    INTO v_store_id, v_channel_id
  FROM public.stores s
  JOIN public.whatsapp_channels c ON c.store_id = s.id
  WHERE s.slug = 'malluspices'
    AND lower(COALESCE(c.status, '')) IN ('active', 'connected')
    AND c.channel_purpose = 'store_customer'
  ORDER BY c.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_store_id IS NULL OR v_channel_id IS NULL THEN
    RAISE NOTICE 'MalluSpices active customer WhatsApp channel not found; template seed skipped.';
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_templates
    (store_id, channel_id, name, language, category, status, components, created_at, updated_at)
  VALUES
    (v_store_id, v_channel_id, 'order_picking_v1', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*ORDER PICKING STARTED*\nOrder: {{2}}\n\nWe have started picking the items in your Mallu Spices order. We will update you again when packing starts.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now(), now()),
    (v_store_id, v_channel_id, 'order_packing_v1', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*ORDER PACKING STARTED*\nOrder: {{2}}\n\nYour Mallu Spices order is now being packed and checked for dispatch. We will update you again when it is ready to ship.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now(), now()),
    (v_store_id, v_channel_id, 'order_ready_to_ship_v1', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*ORDER READY TO SHIP*\nOrder: {{2}}\n\nYour Mallu Spices order has been packed and is ready for courier handover. We will send the tracking update when it ships.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now(), now())
  ON CONFLICT (channel_id, name, language) DO UPDATE SET
    category = EXCLUDED.category,
    components = EXCLUDED.components,
    updated_at = now();

  INSERT INTO public.whatsapp_template_registry
    (store_id, name, meta_template_name, category, language, variables, status)
  VALUES
    (v_store_id, 'Order Picking', 'order_picking_v1', 'UTILITY', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft'),
    (v_store_id, 'Order Packing', 'order_packing_v1', 'UTILITY', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft'),
    (v_store_id, 'Order Ready To Ship', 'order_ready_to_ship_v1', 'UTILITY', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft')
  ON CONFLICT (store_id, meta_template_name) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    language = EXCLUDED.language,
    variables = EXCLUDED.variables;

  INSERT INTO public.whatsapp_event_template_mappings
    (store_id, event_key, event_type, event_source, description, template_id, channel_id, enabled, customer_visible, requires_opt_in, variables, updated_at)
  SELECT v_store_id, x.event_key, 'TRANSACTIONAL', 'ORDER_SERVICE', x.description,
         r.id, v_channel_id, false, true, false, '["customer_name","order_number"]'::jsonb, now()
  FROM (VALUES
    ('order.picking','Order Picking Started','order_picking_v1'),
    ('order.packing','Order Packing Started','order_packing_v1'),
    ('order.ready_to_ship','Order Ready To Ship','order_ready_to_ship_v1')
  ) AS x(event_key, description, template_name)
  JOIN public.whatsapp_template_registry r
    ON r.store_id = v_store_id AND r.meta_template_name = x.template_name
  ON CONFLICT (store_id, event_key) DO UPDATE SET
    description = EXCLUDED.description,
    template_id = EXCLUDED.template_id,
    channel_id = EXCLUDED.channel_id,
    enabled = false,
    variables = EXCLUDED.variables,
    updated_at = now();

  INSERT INTO public.order_whatsapp_template_rules
    (store_id, order_status, template_name, language, enabled, updated_at)
  VALUES
    (v_store_id, 'picking', 'order_picking_v1', 'en_GB', false, now()),
    (v_store_id, 'packing', 'order_packing_v1', 'en_GB', false, now()),
    (v_store_id, 'ready_to_ship', 'order_ready_to_ship_v1', 'en_GB', false, now())
  ON CONFLICT (store_id, order_status) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    language = EXCLUDED.language,
    enabled = false,
    updated_at = now();
END $$;
