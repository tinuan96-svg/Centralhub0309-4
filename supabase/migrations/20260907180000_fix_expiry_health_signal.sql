-- Keep the Site Health expiry signal aligned with the canonical product expiry source.
-- product_expiry is optional historical batch data; products.expiry_date is the
-- current operational source used by the expiry page.

create or replace view public.centralhub_feature_health as
with store_count as (
  select count(*)::numeric as value from public.stores where coalesce(visibility, true) = true
), expected_store_count as (
  select count(*)::numeric as value
  from public.stores
  where slug in ('keralagrocery','malluspices','pocketgrocery','tamilretail')
), order_sync_errors as (
  select count(*)::numeric as value
  from public.order_sync_queue
  where lower(coalesce(status,'')) in ('failed','error')
     or nullif(trim(coalesce(last_error,'')), '') is not null
), product_sync_errors as (
  select count(*)::numeric as value
  from public.products
  where lower(coalesce(sync_status,'')) like '%error%'
     or lower(coalesce(sync_status,'')) like '%fail%'
), product_missing_images as (
  select count(*)::numeric as value
  from public.products
  where coalesce(is_deleted,false) = false
    and nullif(trim(coalesce(image_main, image_url, image_medium, image_thumbnail, '')), '') is null
), product_missing_descriptions as (
  select count(*)::numeric as value
  from public.products
  where coalesce(is_deleted,false) = false
    and nullif(trim(coalesce(description, rich_description, short_description, '')), '') is null
), supplier_duplicate_names as (
  select count(*)::numeric as value
  from (
    select lower(trim(name)) as supplier_name
    from public.suppliers
    where trim(coalesce(name,'')) <> '' and coalesce(is_active,true) = true
    group by lower(trim(name))
    having count(*) > 1
  ) duplicates
), push_enabled_devices as (
  select count(*)::numeric as value
  from public.push_subscriptions
  where coalesce(is_enabled,true) = true
), marketing_registry as (
  select count(*)::numeric as value
  from public.marketing_providers
  where coalesce(is_active,true) = true
), marketing_store_configs as (
  select count(*)::numeric as value
  from public.marketing_provider_configs
), marketing_live_integrations as (
  select count(*)::numeric as value
  from public.marketing_integrations
  where lower(coalesce(status,'')) = 'active'
), analytics_configs as (
  select count(*)::numeric as value
  from public.analytics_store_configs
), analytics_missing_ga4 as (
  select count(*)::numeric as value
  from public.analytics_store_configs
  where nullif(trim(coalesce(ga4_measurement_id,'')), '') is null
     or nullif(trim(coalesce(ga4_property_id,'')), '') is null
), expiry_batches as (
  select greatest(
    (select count(*)::numeric from public.product_expiry),
    (select count(*)::numeric
     from public.products
     where coalesce(is_deleted,false) = false
       and expiry_date is not null)
  ) as value
), notifications as (
  select count(*)::numeric as value from public.system_notifications
)
select 'stores_registered'::text as feature_key,
       case when expected_store_count.value >= 4 then 'pass' else 'fail' end as status,
       case when expected_store_count.value >= 4 then 'info' else 'critical' end as severity,
       expected_store_count.value as current_value,
       4::numeric as target_value,
       'KeralaGrocery, MalluSpices, PocketGrocery and TamilRetail must stay registered in CentralHub.'::text as details,
       now() as checked_at
from expected_store_count
union all
select 'visible_store_count', case when store_count.value >= 4 then 'pass' else 'warn' end,
       case when store_count.value >= 4 then 'info' else 'high' end,
       store_count.value, 4, 'Visible store count available for admin controls.', now()
from store_count
union all
select 'order_sync_errors', case when value = 0 then 'pass' else 'fail' end,
       case when value = 0 then 'info' else 'critical' end,
       value, 0, 'Order sync queue should have no failed/error entries.', now()
from order_sync_errors
union all
select 'product_sync_errors', case when value = 0 then 'pass' else 'fail' end,
       case when value = 0 then 'info' else 'critical' end,
       value, 0, 'Products should not have failed/error sync statuses.', now()
from product_sync_errors
union all
select 'supplier_duplicates', case when value = 0 then 'pass' else 'warn' end,
       case when value = 0 then 'info' else 'medium' end,
       value, 0, 'Active supplier names should not be duplicated after merge/cleanup.', now()
from supplier_duplicate_names
union all
select 'product_missing_images', case when value = 0 then 'pass' else 'warn' end,
       case when value = 0 then 'info' else 'medium' end,
       value, 0, 'Products without image fields need real product images or safe storefront fallback.', now()
from product_missing_images
union all
select 'product_missing_descriptions', case when value = 0 then 'pass' else 'warn' end,
       case when value = 0 then 'info' else 'medium' end,
       value, 0, 'Products without description/rich description need catalogue completion.', now()
from product_missing_descriptions
union all
select 'push_enabled_devices', case when value > 0 then 'pass' else 'warn' end,
       case when value > 0 then 'info' else 'medium' end,
       value, 1, 'At least one Android/PWA device should subscribe after phone alerts are enabled.', now()
from push_enabled_devices
union all
select 'marketing_provider_registry', case when value >= 5 then 'pass' else 'warn' end,
       case when value >= 5 then 'info' else 'medium' end,
       value, 5, 'Ready-made marketing providers should remain registered.', now()
from marketing_registry
union all
select 'marketing_store_configs', case when value > 0 then 'pass' else 'warn' end,
       case when value > 0 then 'info' else 'medium' end,
       value, 1, 'Store-specific marketing provider config rows should exist before live tests.', now()
from marketing_store_configs
union all
select 'marketing_live_integrations', case when value > 0 then 'pass' else 'warn' end,
       case when value > 0 then 'info' else 'medium' end,
       value, 1, 'Live integrations need real API credentials and successful connection.', now()
from marketing_live_integrations
union all
select 'analytics_store_configs', case when analytics_configs.value >= 4 then 'pass' else 'warn' end,
       case when analytics_configs.value >= 4 then 'info' else 'medium' end,
       analytics_configs.value, 4, 'Analytics config should exist separately for each store.', now()
from analytics_configs
union all
select 'analytics_missing_ga4', case when value = 0 then 'pass' else 'warn' end,
       case when value = 0 then 'info' else 'medium' end,
       value, 0, 'GA4 measurement/property IDs are missing for one or more stores.', now()
from analytics_missing_ga4
union all
select 'expiry_batches', case when value > 0 then 'pass' else 'warn' end,
       case when value > 0 then 'info' else 'low' end,
       value, 1, 'Expiry/loss trend charts use product expiry dates or recorded expiry batches.', now()
from expiry_batches
union all
select 'system_notifications', case when value >= 0 then 'pass' else 'warn' end,
       'info', value, 0, 'System notification table is readable for in-app/admin alerts.', now()
from notifications;

grant select on public.centralhub_feature_health to authenticated;
grant select on public.centralhub_feature_health to service_role;
