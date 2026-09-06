insert into public.marketing_provider_configs (
  store_id,
  provider_id,
  redirect_uri,
  app_label,
  status,
  public_config,
  metadata,
  created_at,
  updated_at
)
select
  s.id,
  p.id,
  case
    when p.connection_mode = 'oauth2' then concat('https://centralhub.network/api/marketing/oauth/callback/', p.id)
    else null
  end as redirect_uri,
  concat(s.name, ' - ', p.display_name) as app_label,
  'disabled' as status,
  jsonb_build_object(
    'ready_made', true,
    'credential_status', 'missing',
    'store_slug', s.slug,
    'provider_display_name', p.display_name
  ) as public_config,
  jsonb_build_object(
    'created_by', 'centralhub_audit_2026_09_06',
    'purpose', 'ready-made per-store provider slot; enter platform credentials/API keys to activate',
    'centralhub_control_hidden_from_storefronts', true
  ) as metadata,
  now(),
  now()
from public.stores s
cross join public.marketing_providers p
where coalesce(s.visibility, true) = true
  and coalesce(p.is_active, true) = true
on conflict (store_id, provider_id) do update
set app_label = excluded.app_label,
    redirect_uri = coalesce(public.marketing_provider_configs.redirect_uri, excluded.redirect_uri),
    public_config = coalesce(public.marketing_provider_configs.public_config, '{}'::jsonb) || excluded.public_config,
    metadata = coalesce(public.marketing_provider_configs.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
