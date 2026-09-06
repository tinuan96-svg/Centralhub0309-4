alter table public.marketing_provider_configs
  add column if not exists encrypted_developer_token text,
  add column if not exists login_customer_id text;

create index if not exists marketing_connections_store_provider_status_idx
  on public.marketing_connections(store_id, provider_id, status);

create index if not exists marketing_assets_store_type_idx
  on public.marketing_assets(store_id, asset_type);

create index if not exists marketing_metrics_store_provider_date_idx
  on public.marketing_metrics(store_id, provider_id, date desc);

create index if not exists marketing_campaigns_store_provider_idx
  on public.marketing_campaigns(store_id, provider_id);

comment on column public.marketing_provider_configs.encrypted_developer_token is
  'AES-GCM encrypted provider/API developer token; never expose to client';

comment on column public.marketing_provider_configs.login_customer_id is
  'Google Ads manager customer ID, normalized without hyphens';
