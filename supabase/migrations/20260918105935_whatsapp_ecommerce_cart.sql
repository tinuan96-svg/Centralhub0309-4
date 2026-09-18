-- WhatsApp conversational ecommerce cart.
-- Private service-role-only state. Checkout remains on each independent storefront.
create table if not exists public.whatsapp_carts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  status text not null default 'active' check (status in ('active','checkout_started','converted','abandoned')),
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  checkout_link_created_at timestamptz,
  converted_order_id uuid references public.orders(id) on delete set null,
  constraint whatsapp_carts_store_conversation_key unique (store_id, conversation_id)
);

create table if not exists public.whatsapp_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.whatsapp_carts(id) on delete cascade,
  storefront_product_id uuid not null,
  centralhub_product_id uuid references public.products(id) on delete set null,
  variant_id uuid,
  product_name text not null,
  brand text,
  quantity integer not null default 1 check (quantity between 1 and 99),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  regular_price numeric(12,2),
  currency text not null default 'GBP',
  stock_snapshot integer,
  product_url text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_cart_items_unique_item
  on public.whatsapp_cart_items (
    cart_id,
    storefront_product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists whatsapp_carts_contact_status_idx
  on public.whatsapp_carts (contact_id, status, last_activity_at desc);

create index if not exists whatsapp_cart_items_cart_idx
  on public.whatsapp_cart_items (cart_id, created_at);

alter table public.whatsapp_carts enable row level security;
alter table public.whatsapp_cart_items enable row level security;

revoke all on table public.whatsapp_carts from anon, authenticated;
revoke all on table public.whatsapp_cart_items from anon, authenticated;
grant all on table public.whatsapp_carts to service_role;
grant all on table public.whatsapp_cart_items to service_role;

comment on table public.whatsapp_carts is
  'Private service-role-only shopping carts created from store customer conversations. Checkout is completed on the independent storefront.';

comment on table public.whatsapp_cart_items is
  'Private service-role-only WhatsApp cart lines. Prices are snapshots only and storefront checkout must revalidate live price and stock.';
