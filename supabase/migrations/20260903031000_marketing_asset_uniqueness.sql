alter table public.marketing_assets
  add constraint marketing_assets_store_connection_type_external_key
  unique (store_id, connection_id, asset_type, external_id);
