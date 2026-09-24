-- The registered Kerala Groceries (Tasty Kerala LTD) site is separate from ker alagrocery.com.
-- Existing store identity is reused, not duplicated. No existing store identities or credentials change.
update public.stores
set name='Kerala Groceries (Tasty Kerala LTD)'
where slug='tastykerala' and domain='keralagroceries.com'
and project_ref='mlytdvhwvjiyfchtejli';

CREATE OR REPLACE FUNCTION public.tasty_kerala_operational_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with checked_store as (
 select id from public.stores
 where slug='tastykerala' and domain='keralagroceries.com'
   and project_ref='mlytdvhwvjiyfchtejli' and visibility=true
 limit 1
), products_json as (
 select coalesce(jsonb_agg(
   jsonb_build_object(
    'id',p.id,'name',p.name,'slug',p.slug,'brand',p.brand,'price',p.price,
    'sale_price',p.sale_price,'cost_price',p.cost_price,
    'stock',greatest(0,case when exp.product_id is not null
       then least(greatest(0,coalesce(inv.stock_quantity,p.stock,0)),greatest(0,coalesce(exp.sellable_stock,0)))
       else coalesce(inv.stock_quantity,p.stock,0) end),
    'sku',p.sku,'gtin',p.gtin,'unit',p.unit,'weight',p.weight,'weight_kg',p.weight_kg,
    'weight_grams',p.weight_grams,'pack_size',p.pack_size,'pack_unit',p.pack_unit,
    'product_type',p.product_type,'warehouse_location',p.warehouse_location,
    'variant_group_key',coalesce(link.group_key,p.variant_group_key),
    'backorder',coalesce(p.allow_backorder,p.backorder,false),
    'is_active',p.is_active,'is_published',p.is_published,
    'is_archived',p.is_archived,'is_deleted',p.is_deleted,
    'expiry_date',p.expiry_date,'expiry_blocked',p.expiry_blocked,
    'audit_hold_status',p.audit_hold_status,'approval_status',p.approval_status,
    'main_category',p.main_category,'category',p.category,
    'image_url',coalesce(nullif(btrim(p.image_main),''),nullif(btrim(p.image_url),''),nullif(btrim(p.image_medium),''),nullif(btrim(p.image_thumbnail),'')),
    'description',coalesce(nullif(btrim(p.description),''),nullif(btrim(p.rich_description),''),nullif(btrim(p.short_description),'')),
    'seo_title',coalesce(nullif(btrim(p.seo_meta_title),''),nullif(btrim(p.seo_title),'')),
    'seo_description',p.seo_meta_description,
    'store_visible',coalesce(vis.is_visible,false),
    'size_label',case when p.weight_grams>0 then p.weight_grams::text||'g'
                     when p.pack_size>0 and nullif(btrim(p.pack_unit),'') is not null
                        then p.pack_size::text||' '||p.pack_unit
                     else null end,
    'source_updated_at',p.updated_at
   ) order by p.id
 ),'[]'::jsonb) as data,
 count(*)::integer as total
 from public.products p
 left join public.central_inventory inv on inv.product_id=p.id
 left join public.product_expiry_product_summary exp on exp.product_id=p.id
 left join public.product_variant_links link on link.product_id=p.id
 left join public.store_product_visibility vis
  on vis.product_id=p.id and vis.store_id=(select id from checked_store)
 where exists(select 1 from checked_store)
), variants_json as (
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',v.id,'product_id',v.product_id,'variant_name',v.variant_name,'sku',v.sku,
   'barcode',v.barcode,'unit_value',v.unit_value,'unit_type',v.unit_type,
   'pack_type',v.pack_type,'pack_quantity',v.pack_quantity,'weight_grams',v.weight_grams,
   'price',v.price,'discounted_price',v.discounted_price,'cost_price',v.cost_price,
   'stock',v.stock,'is_active',v.is_active,'sort_order',v.sort_order,
   'attributes',v.attributes,'updated_at',v.updated_at
 ) order by v.id),'[]'::jsonb) as data,count(*)::integer as total
 from public.product_variants v where exists(select 1 from checked_store)
)
select jsonb_build_object('version',1,'source_project','icnvrpnzjjcbvgcqgiua',
'store_slug','tastykerala','store_domain','keralagroceries.com','snapshot_at',now(),
'product_count',(select total from products_json),'variant_count',(select total from variants_json),
'products',(select data from products_json),'variants',(select data from variants_json));
$function$
;
revoke all on function public.tasty_kerala_operational_snapshot() from public,anon,authenticated;
grant execute on function public.tasty_kerala_operational_snapshot() to service_role;

CREATE OR REPLACE FUNCTION public.tasty_verify_private_product_push(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions', 'pg_temp'
AS $function$
 select coalesce(p_token ~ '^[a-f0-9]{64}$',false)
 and exists(
   select 1 from vault.decrypted_secrets
    where name='tasty_kerala_centralhub_sync_secret'
      and encode(digest(decrypted_secret,'sha256'),'hex') =
          encode(digest(coalesce(p_token,''),'sha256'),'hex')
 );
$function$
;
revoke all on function public.tasty_verify_private_product_push(text) from public,anon,authenticated;
grant execute on function public.tasty_verify_private_product_push(text) to anon,service_role;

CREATE OR REPLACE FUNCTION public.tasty_kerala_push_operational_snapshot()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net', 'pg_temp'
AS $function$
declare
 secret_token text;
 outgoing jsonb;
 request_id bigint;
begin
 select decrypted_secret into secret_token
 from vault.decrypted_secrets where name='tasty_kerala_centralhub_sync_secret'
 order by created_at desc limit 1;
 if secret_token is null or length(secret_token)<>64 then
   raise exception 'Private Tasty Kerala sync credential unavailable';
 end if;
 outgoing:=public.tasty_kerala_operational_snapshot();
 if (outgoing->>'source_project')<>'icnvrpnzjjcbvgcqgiua'
 or (outgoing->>'store_domain')<>'keralagroceries.com'
 or (outgoing->>'product_count')::integer<1 then
   raise exception 'Invalid Tasty Kerala source snapshot';
 end if;
 select net.http_post(
  url:='https://mlytdvhwvjiyfchtejli.supabase.co/functions/v1/tasty-centralhub-raw-products',
  headers:=jsonb_build_object('Content-Type','application/json','x-tasty-sync-secret',secret_token),
  body:=outgoing,
  timeout_milliseconds:=120000
 ) into request_id;
 return request_id;
end;
$function$
;
revoke all on function public.tasty_kerala_push_operational_snapshot() from public,anon,authenticated;
grant execute on function public.tasty_kerala_push_operational_snapshot() to service_role;

do $$
begin
 if exists(select 1 from cron.job where jobname='tasty-kerala-raw-product-sync') then
  perform cron.unschedule('tasty-kerala-raw-product-sync');
 end if;
 perform cron.schedule('tasty-kerala-raw-product-sync','*/5 * * * *',
   'select public.tasty_kerala_push_operational_snapshot();');
end $$;
