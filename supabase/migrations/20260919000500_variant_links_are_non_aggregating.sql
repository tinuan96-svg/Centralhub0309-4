-- Fixed multi-store product identity rule:
-- every physical SKU/weight remains an independent products row.
-- Variant grouping is linking/presentation metadata only; operational fields never aggregate.

create table if not exists public.product_variant_links (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  relationship text not null default 'variant_link' check (relationship = 'variant_link'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id)
);

create index if not exists product_variant_links_group_key_idx
  on public.product_variant_links(group_key);

alter table public.product_variant_links enable row level security;

drop policy if exists "Authenticated users can read product variant links" on public.product_variant_links;
create policy "Authenticated users can read product variant links"
on public.product_variant_links for select
to authenticated
using (true);

comment on table public.product_variant_links is
  'Non-owning links between independently stocked product SKUs. Never use this table to aggregate stock, barcode, price, location, expiry or SKU identity.';

comment on column public.product_variant_links.group_key is
  'Normalized identity key for same product name + brand + category + unit/type. Weight/pack size remains on each linked products row and distinguishes the SKU.';

-- Retire the old automatic parent promotion. Creating/linking a variant must not
-- turn an independently stocked SKU into a stock-owning variable parent.
drop trigger if exists trg_promote_parent_product_to_variable on public.product_variants;
drop function if exists public.promote_parent_product_to_variable();

-- Record the mandatory rule in Shruthi's operating knowledge when available.
do $$
begin
  if to_regclass('public.shruthi_project_knowledge') is not null then
    insert into public.shruthi_project_knowledge(scope,topic,content,source_type,source_date,priority,tags)
    values (
      'products',
      'variant_linking_fixed_rule',
      'Mandatory across CentralHub and all managed stores: every physical weight/unit/pack SKU remains a separate product with its own product ID, SKU, barcode, stock, price, warehouse location and expiry. Products with the same normalized product name, brand, category and unit/type may be linked as variants for grouping/display only. Different weight or pack size distinguishes the linked SKU. Never aggregate, merge, inherit or share stock or other operational fields between linked products.',
      'curated_chat',
      current_date,
      100,
      array['products','variants','fixed-rule','stock','barcode','multi-store']
    )
    on conflict do nothing;
  end if;
end $$;
