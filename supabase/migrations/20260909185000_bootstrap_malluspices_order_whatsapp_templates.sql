-- Bootstrap the actual Meta templates required by automatic MalluSpices order
-- status notifications. The registry previously said `active` even though the
-- connected WABA returned zero templates; that false-positive state caused Meta
-- error 132001 (template name does not exist in the translation).

alter table public.whatsapp_templates
  add column if not exists submitted_at timestamptz;

-- Create the local submission records from stable store/channel identity. These
-- rows are the source payload used by whatsapp-template-submit.
insert into public.whatsapp_templates (
  store_id, channel_id, name, language, category, status, components,
  rejection_reason, created_at, updated_at
)
select
  s.id,
  c.id,
  x.name,
  'en_GB',
  'UTILITY',
  'DRAFT',
  x.components,
  null,
  now(),
  now()
from public.stores s
join public.whatsapp_channels c on c.store_id = s.id
cross join lateral (
  values
    (
      'order_confirm_v1'::text,
      jsonb_build_array(
        jsonb_build_object(
          'type','BODY',
          'text','Hi {{1}}, your Mallu Spices order {{2}} is confirmed. We will update you when it is dispatched.',
          'example',jsonb_build_object('body_text',jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
        )
      )
    ),
    (
      'ship_update_v1'::text,
      jsonb_build_array(
        jsonb_build_object(
          'type','BODY',
          'text','Your Mallu Spices order {{1}} has a shipping update. Track your delivery here: {{2}}',
          'example',jsonb_build_object('body_text',jsonb_build_array(jsonb_build_array('MS-12345','https://www.dhl.com/')))
        )
      )
    ),
    (
      'order_delivered_v1'::text,
      jsonb_build_array(
        jsonb_build_object(
          'type','BODY',
          'text','Hi {{1}}, your Mallu Spices order {{2}} has been delivered. Thank you for shopping with us.',
          'example',jsonb_build_object('body_text',jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
        )
      )
    ),
    (
      'order_cancelled_v1'::text,
      jsonb_build_array(
        jsonb_build_object(
          'type','BODY',
          'text','Hi {{1}}, your Mallu Spices order {{2}} has been cancelled. Please message us if you need help.',
          'example',jsonb_build_object('body_text',jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
        )
      )
    ),
    (
      'order_returned_v1'::text,
      jsonb_build_array(
        jsonb_build_object(
          'type','BODY',
          'text','Hi {{1}}, your Mallu Spices order {{2}} has been returned or refunded. Please message us if you need help.',
          'example',jsonb_build_object('body_text',jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
        )
      )
    )
) as x(name, components)
where lower(s.slug) = 'malluspices'
  and lower(coalesce(c.status,'')) in ('active','connected')
on conflict (channel_id, name, language) do update set
  category = excluded.category,
  components = excluded.components,
  rejection_reason = null,
  updated_at = now();

-- Never claim a template is active unless it is present in the Meta-synced
-- table as APPROVED. whatsapp-template-sync will promote these rows when Meta
-- reports the real state.
update public.whatsapp_template_registry r
set status = 'draft'
from public.stores s
where r.store_id = s.id
  and lower(s.slug) = 'malluspices'
  and r.meta_template_name in (
    'order_confirm_v1','ship_update_v1','order_delivered_v1',
    'order_cancelled_v1','order_returned_v1'
  )
  and not exists (
    select 1
    from public.whatsapp_templates t
    where t.store_id = r.store_id
      and t.name = r.meta_template_name
      and t.language = r.language
      and lower(coalesce(t.status,'')) = 'approved'
  );

notify pgrst, 'reload schema';
