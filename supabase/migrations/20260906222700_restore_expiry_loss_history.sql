create table if not exists public.inventory_expiry_writeoffs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  expiry_date date not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  total_cost numeric(16,4) generated always as (quantity::numeric * unit_cost) stored,
  source text not null default 'expired_stock_reduction',
  note text,
  recorded_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists inventory_expiry_writeoffs_product_idx on public.inventory_expiry_writeoffs(product_id);
create index if not exists inventory_expiry_writeoffs_recorded_idx on public.inventory_expiry_writeoffs(recorded_at desc);
create index if not exists inventory_expiry_writeoffs_expiry_idx on public.inventory_expiry_writeoffs(expiry_date);

alter table public.inventory_expiry_writeoffs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_expiry_writeoffs'
      and policyname = 'Authenticated users can view expiry writeoffs'
  ) then
    create policy "Authenticated users can view expiry writeoffs"
      on public.inventory_expiry_writeoffs
      for select
      to authenticated
      using (true);
  end if;
end $$;

grant select on public.inventory_expiry_writeoffs to authenticated;
grant all on public.inventory_expiry_writeoffs to service_role;

create or replace function public.capture_expired_inventory_writeoff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_expiry date;
  reduction integer;
begin
  effective_expiry := new.expiry_date;
  reduction := greatest(coalesce(old.stock, 0) - coalesce(new.stock, 0), 0);

  if reduction > 0
     and effective_expiry is not null
     and effective_expiry < current_date then
    insert into public.inventory_expiry_writeoffs (
      product_id,
      product_name,
      sku,
      expiry_date,
      quantity,
      unit_cost,
      source,
      created_by
    ) values (
      old.id,
      coalesce(new.name, old.name),
      coalesce(new.sku, old.sku),
      effective_expiry,
      reduction,
      greatest(coalesce(old.cost_price, new.cost_price, 0), 0),
      'expired_stock_reduction',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capture_expired_inventory_writeoff on public.products;
create trigger trg_capture_expired_inventory_writeoff
after update of stock on public.products
for each row
when (old.stock is distinct from new.stock)
execute function public.capture_expired_inventory_writeoff();

comment on table public.inventory_expiry_writeoffs is 'Permanent expiry-loss ledger. Records reductions of stock after the product expiry date so historical expiry losses do not disappear when inventory is cleared.';
