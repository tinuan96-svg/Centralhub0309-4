-- Meta requires template variables not to be the leading or trailing content.
-- Keep the tracking URL variable in the body but add stable text after it.
update public.whatsapp_templates t
set
  components = jsonb_build_array(
    jsonb_build_object(
      'type','BODY',
      'text','Your Mallu Spices order {{1}} has a shipping update. Tracking link: {{2}}. Thank you.',
      'example',jsonb_build_object(
        'body_text',jsonb_build_array(
          jsonb_build_array('MS-12345','https://www.dhl.com/')
        )
      )
    )
  ),
  rejection_reason = null,
  updated_at = now()
from public.stores s
where t.store_id = s.id
  and lower(s.slug) = 'malluspices'
  and t.name = 'ship_update_v1'
  and t.language = 'en_GB';
