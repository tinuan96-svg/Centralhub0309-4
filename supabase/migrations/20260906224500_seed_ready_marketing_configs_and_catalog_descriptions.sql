insert into public.marketing_provider_configs (store_id, provider_id, status, metadata)
select s.id,
       p.id,
       'disabled',
       jsonb_build_object(
         'setup_state','awaiting_credentials',
         'store_owned',true,
         'placeholder',true,
         'seeded_by','centralhub_catalog_readiness'
       )
from public.stores s
cross join public.marketing_providers p
where coalesce(s.visibility,true)=true
  and coalesce(p.is_active,true)=true
on conflict (store_id,provider_id) do nothing;

update public.products
set short_description = trim(
      concat(
        case when nullif(trim(coalesce(brand,'')),'') is not null then trim(brand) || ' ' else '' end,
        trim(name),
        case when nullif(trim(coalesce(category,'')),'') is not null then ' — ' || trim(category) || '.' else '.' end,
        ' Check the product packaging for the current product information, ingredients or materials, directions, safety or allergen information where applicable, and storage guidance.'
      )
    ),
    seo_meta_description = case
      when nullif(trim(coalesce(seo_meta_description,'')),'') is null then left(trim(
        concat(
          case when nullif(trim(coalesce(brand,'')),'') is not null then trim(brand) || ' ' else '' end,
          trim(name),
          case when nullif(trim(coalesce(category,'')),'') is not null then ' — ' || trim(category) || '.' else '.' end,
          ' Product information and availability in CentralHub.'
        )
      ), 160)
      else seo_meta_description
    end,
    updated_at = now()
where coalesce(is_deleted,false)=false
  and coalesce(is_archived,false)=false
  and nullif(trim(coalesce(description,rich_description,short_description,'')),'') is null;