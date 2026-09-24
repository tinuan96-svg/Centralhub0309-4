-- Tasty Kerala explicit per-product visibility; do not auto-publish other stores.
-- Only centrally approved, active, live, photo-verified, non-expired products are opted-in.
insert into public.store_product_visibility(store_id,product_id,is_visible)
select s.id,p.id,true from public.stores s join public.products p on true
where s.slug='tastykerala' and s.domain='keralagroceries.com'
and s.project_ref='mlytdvhwvjiyfchtejli'
and p.approval_status='approved' and p.is_published=true and p.is_active=true
and not coalesce(p.is_deleted,false) and not coalesce(p.is_archived,false)
and not coalesce(p.expiry_blocked,false) and (p.expiry_date is null or p.expiry_date>current_date+20)
and lower(coalesce(p.audit_hold_status,'none')) in ('none','clear','released')
and p.price>0 and nullif(btrim(p.brand),'') is not null
and coalesce(nullif(btrim(p.image_main),''),nullif(btrim(p.image_url),''),nullif(btrim(p.image_medium),''),nullif(btrim(p.image_thumbnail),'')) ~* '^https://'
and coalesce(nullif(btrim(p.description),''),nullif(btrim(p.rich_description),''),nullif(btrim(p.short_description),'')) is not null
on conflict(store_id,product_id) do nothing;
-- Missing store-product visibility is now DENY rather than implicitly allowed.
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
