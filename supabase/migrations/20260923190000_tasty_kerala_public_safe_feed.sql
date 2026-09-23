-- CentralHub -> Tasty Kerala: ONLY public-ready, explicitly opted-in products.
-- Unapproved, private or commercially sensitive fields must never leave CentralHub through this public RPC.
CREATE OR REPLACE FUNCTION public.tasty_kerala_published_feed(p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with feed as (
select p.id, jsonb_build_object(
 'id',p.id,'sync_source','centralhub','name',p.name,'brand',p.brand,'price',p.price,
 'stock',greatest(0,least(coalesce(inv.stock_quantity,p.stock,0),coalesce(exp.sellable_stock,inv.stock_quantity,p.stock,0))),
 'allow_backorder',coalesce(p.allow_backorder,false),
 'main_category',p.main_category,'category',p.category,'image_url',assets.img,'description',assets.descript,
 'seo_title',assets.seotitle,'seo_description',p.seo_meta_description,
 'approval_status',p.approval_status,'is_published',p.is_published,'is_active',p.is_active,
 'is_deleted',false,'is_archived',false,'expiry_blocked',false,'expiry_date',p.expiry_date,
 'audit_hold_status',coalesce(p.audit_hold_status,'none'),'store_visible',true,
 'size_label',case when p.weight_grams>0 then p.weight_grams::text||'g'
 when p.pack_size>0 and nullif(btrim(p.pack_unit),'') is not null then p.pack_size::text||' '||p.pack_unit else null end,
 'sync_event_at',now()) as payload
from public.products p
join public.store_product_visibility v on v.product_id=p.id and v.is_visible=true
join public.stores s on s.id=v.store_id and s.slug='tastykerala' and s.visibility=true
left join public.central_inventory inv on inv.product_id=p.id
left join public.product_expiry_product_summary exp on exp.product_id=p.id
cross join lateral(select 
coalesce(nullif(btrim(p.image_main),''),nullif(btrim(p.image_url),''),nullif(btrim(p.image_medium),''),nullif(btrim(p.image_thumbnail),'')) as img,
coalesce(nullif(btrim(p.description),''),nullif(btrim(p.rich_description),''),nullif(btrim(p.short_description),'')) as descript,
coalesce(nullif(btrim(p.seo_meta_title),''),nullif(btrim(p.seo_title),'')) as seotitle) assets
where p.id>coalesce(p_after,'00000000-0000-0000-0000-000000000000'::uuid)
and p.approval_status='approved' and p.is_published=true and p.is_active=true 
and not coalesce(p.is_deleted,false) and not coalesce(p.is_archived,false)
and not coalesce(p.expiry_blocked,false)
and (p.expiry_date is null or p.expiry_date>current_date+20)
and lower(coalesce(p.audit_hold_status,'none')) in ('none','clear','released')
and nullif(btrim(p.name),'') is not null and nullif(btrim(p.brand),'') is not null 
and nullif(btrim(coalesce(p.main_category,p.category,'')),'') is not null
and assets.img ~* '^https://' and assets.descript is not null and assets.seotitle is not null
and nullif(btrim(p.seo_meta_description),'') is not null and p.price>0 
and (coalesce(exp.sellable_stock,inv.stock_quantity,p.stock,0)>0 or coalesce(p.allow_backorder,false))
and lower(p.name) not like '%lost mary%'
order by p.id limit least(greatest(coalesce(p_limit,100),1),100)
)
select jsonb_build_object('products',coalesce(jsonb_agg(payload order by id),'[]'::jsonb),
'next_cursor',case when count(*)=least(greatest(coalesce(p_limit,100),1),100) then max(id::text) else null end,
'count',count(*)) from feed;
$function$

revoke all on function public.tasty_kerala_published_feed(uuid,integer) from public,anon,authenticated;
grant execute on function public.tasty_kerala_published_feed(uuid,integer) to anon,authenticated,service_role;
