create or replace view public.view_inventory_activity_log
with (security_invoker = true)
as
select
  il.id,
  il.product_id,
  il.product_name,
  il.sku,
  il.store_id,
  il.order_id,
  il.reference_id,
  il.reference_number,
  il.reference_type,
  il.change,
  il.old_quantity,
  il.new_quantity,
  il.type,
  il.movement_type,
  il.reason,
  il.notes,
  il.edited_by,
  il.device_name,
  il.created_at,
  coalesce(p.name, il.product_name) as live_product_name,
  il.sku as live_sku,
  up.email::varchar(255) as user_email,
  s.name as store_name
from public.inventory_logs il
left join public.products p on p.id = il.product_id
left join public.user_profiles up on up.id = il.edited_by
left join public.stores s on s.id = il.store_id;

revoke all on table public.view_inventory_activity_log from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.view_inventory_activity_log from authenticated;
grant select on table public.view_inventory_activity_log
  to authenticated, service_role, fdw_reader;

comment on view public.view_inventory_activity_log is
  'Authenticated inventory audit view. Uses security invoker and public user profiles; never exposes auth.users.';
