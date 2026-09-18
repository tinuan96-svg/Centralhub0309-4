
-- Batch-aware expiry model.
-- Every expiry lot/box stays as a separate product_expiry row.
-- Products remain sellable while at least one tracked batch is outside the 20-day block window.
-- Storefront stock is derived as physical stock minus blocked batch stock.

alter table public.product_expiry
  add column if not exists remaining_quantity integer;

update public.product_expiry
set remaining_quantity = quantity
where remaining_quantity is null;

alter table public.product_expiry
  alter column remaining_quantity set default 0;

alter table public.product_expiry
  alter column remaining_quantity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.product_expiry'::regclass
      and conname='product_expiry_remaining_quantity_check'
  ) then
    alter table public.product_expiry
      add constraint product_expiry_remaining_quantity_check
      check (remaining_quantity >= 0);
  end if;
end $$;

alter table public.products
  add column if not exists expiry_blocked boolean not null default false;
alter table public.products
  add column if not exists expiry_blocked_at timestamptz;
alter table public.products
  add column if not exists expiry_prev_is_active boolean;
alter table public.products
  add column if not exists expiry_prev_is_published boolean;

-- Convert existing single-expiry stock into one tracked batch so future second/third boxes
-- can coexist without losing the original date.
insert into public.product_expiry(product_id,batch_id,expiry_date,quantity,remaining_quantity,created_at,updated_at)
select
  p.id,
  case when nullif(trim(coalesce(p.sku,'')),'') is not null
       then 'LEGACY-' || p.sku
       else 'LEGACY-' || left(p.id::text,8) end,
  p.expiry_date,
  greatest(coalesce(p.stock,0),0),
  greatest(coalesce(p.stock,0),0),
  now(),
  now()
from public.products p
where p.expiry_date is not null
  and coalesce(p.is_deleted,false)=false
  and not exists (
    select 1 from public.product_expiry e where e.product_id=p.id
  );

create index if not exists idx_product_expiry_product_date_remaining
  on public.product_expiry(product_id,expiry_date)
  where remaining_quantity > 0;

create or replace view public.product_expiry_product_summary as
select
  p.id as product_id,
  greatest(coalesce(p.stock,0),0)::integer as physical_stock,
  count(e.id) filter (where e.remaining_quantity > 0)::integer as active_batch_count,
  coalesce(sum(e.remaining_quantity) filter (where e.remaining_quantity > 0),0)::integer as tracked_remaining,
  coalesce(sum(e.remaining_quantity) filter (
    where e.remaining_quantity > 0
      and e.expiry_date <= current_date + 20
  ),0)::integer as blocked_remaining,
  coalesce(sum(e.remaining_quantity) filter (
    where e.remaining_quantity > 0
      and e.expiry_date > current_date + 20
  ),0)::integer as fresh_remaining,
  min(e.expiry_date) filter (where e.remaining_quantity > 0) as nearest_expiry,
  min(e.expiry_date) filter (
    where e.remaining_quantity > 0
      and e.expiry_date > current_date + 20
  ) as nearest_sellable_expiry,
  case
    when count(e.id) filter (where e.remaining_quantity > 0) > 0 then
      greatest(
        least(
          greatest(coalesce(p.stock,0),0)
            - coalesce(sum(e.remaining_quantity) filter (
                where e.remaining_quantity > 0
                  and e.expiry_date <= current_date + 20
              ),0),
          coalesce(sum(e.remaining_quantity) filter (
            where e.remaining_quantity > 0
              and e.expiry_date > current_date + 20
          ),0)
        ),
        0
      )::integer
    when p.expiry_date is not null and p.expiry_date <= current_date + 20 then 0
    else greatest(coalesce(p.stock,0),0)::integer
  end as sellable_stock
from public.products p
left join public.product_expiry e on e.product_id=p.id
group by p.id,p.stock,p.expiry_date;

create or replace function public.refresh_product_expiry_state(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary public.product_expiry_product_summary%rowtype;
  v_product public.products%rowtype;
  v_should_block boolean;
begin
  select * into v_summary
  from public.product_expiry_product_summary
  where product_id=p_product_id;

  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if not found then return; end if;

  v_should_block :=
    coalesce(v_summary.blocked_remaining,0) > 0
    and coalesce(v_summary.sellable_stock,0) <= 0;

  if v_should_block then
    update public.products
    set
      expiry_blocked = true,
      expiry_blocked_at = coalesce(expiry_blocked_at, now()),
      expiry_prev_is_active = case
        when expiry_blocked then expiry_prev_is_active
        when lower(coalesce(approval_status,''))='approved' then true
        else coalesce(is_active,false)
      end,
      expiry_prev_is_published = case
        when expiry_blocked then expiry_prev_is_published
        when lower(coalesce(approval_status,''))='approved' then true
        else coalesce(is_published,false)
      end,
      is_active = false,
      is_published = false,
      updated_at = now()
    where id=p_product_id
      and (
        expiry_blocked is distinct from true
        or coalesce(is_active,true)=true
        or coalesce(is_published,true)=true
      );
  elsif coalesce(v_product.expiry_blocked,false) then
    update public.products
    set
      expiry_blocked = false,
      expiry_blocked_at = null,
      is_active = coalesce(expiry_prev_is_active,
        case when lower(coalesce(approval_status,''))='approved' then true else is_active end),
      is_published = case
        when lower(coalesce(approval_status,''))='approved'
          then coalesce(expiry_prev_is_published,true)
        else false
      end,
      expiry_prev_is_active = null,
      expiry_prev_is_published = null,
      updated_at = now()
    where id=p_product_id;
  end if;
end;
$$;

create or replace function public.refresh_all_product_expiry_states()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.id
    from public.products p
    where coalesce(p.is_deleted,false)=false
      and (
        p.expiry_date is not null
        or exists(select 1 from public.product_expiry e where e.product_id=p.id and e.remaining_quantity>0)
        or coalesce(p.expiry_blocked,false)
      )
  loop
    perform public.refresh_product_expiry_state(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.enforce_product_expiry_20d()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_count integer := 0;
  v_fresh integer := 0;
begin
  if new.id is not null then
    select
      count(*) filter (where remaining_quantity>0),
      coalesce(sum(remaining_quantity) filter (
        where remaining_quantity>0 and expiry_date > current_date + 20
      ),0)
    into v_batch_count,v_fresh
    from public.product_expiry
    where product_id=new.id;
  end if;

  if (
    (v_batch_count > 0 and v_fresh <= 0)
    or
    (v_batch_count = 0 and new.expiry_date is not null and new.expiry_date <= current_date + 20)
  ) then
    new.is_active := false;
    new.is_published := false;
    new.expiry_blocked := true;
    new.expiry_blocked_at := coalesce(new.expiry_blocked_at,now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_product_expiry_20d on public.products;
create trigger trg_enforce_product_expiry_20d
before insert or update of expiry_date,is_active,is_published
on public.products
for each row
execute function public.enforce_product_expiry_20d();

create or replace function public.sync_product_expiry_batch_summary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id uuid;
  v_nearest date;
begin
  v_product_id := coalesce(new.product_id,old.product_id);

  select min(expiry_date)
  into v_nearest
  from public.product_expiry
  where product_id=v_product_id
    and remaining_quantity>0;

  update public.products
  set expiry_date=v_nearest,
      updated_at=now()
  where id=v_product_id
    and expiry_date is distinct from v_nearest;

  perform public.refresh_product_expiry_state(v_product_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_sync_product_expiry_batch_summary on public.product_expiry;
create trigger trg_sync_product_expiry_batch_summary
after insert or update of expiry_date,remaining_quantity,quantity or delete
on public.product_expiry
for each row
execute function public.sync_product_expiry_batch_summary();

create or replace function public.init_product_expiry_remaining_quantity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.remaining_quantity is null or new.remaining_quantity < 0 then
    new.remaining_quantity := greatest(new.quantity,0);
  end if;
  if tg_op='INSERT' and new.remaining_quantity=0 and new.quantity>0 then
    new.remaining_quantity := new.quantity;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_init_product_expiry_remaining_quantity on public.product_expiry;
create trigger trg_init_product_expiry_remaining_quantity
before insert or update of quantity
on public.product_expiry
for each row
execute function public.init_product_expiry_remaining_quantity();

-- Any normal stock reduction is assumed to come from sellable (non-blocked) batches first.
-- Blocked batches stay quarantined until explicitly adjusted/removed.
create or replace function public.consume_sellable_expiry_batches_on_stock_decrease()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta integer;
  r record;
  v_take integer;
begin
  v_delta := greatest(coalesce(old.stock,0)-coalesce(new.stock,0),0);
  if v_delta <= 0 then return new; end if;

  for r in
    select id,remaining_quantity
    from public.product_expiry
    where product_id=new.id
      and remaining_quantity>0
      and expiry_date > current_date + 20
    order by expiry_date asc,created_at asc,id asc
    for update
  loop
    exit when v_delta<=0;
    v_take := least(v_delta,r.remaining_quantity);
    update public.product_expiry
    set remaining_quantity=remaining_quantity-v_take,
        updated_at=now()
    where id=r.id;
    v_delta := v_delta-v_take;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_10_consume_sellable_expiry_batches_on_stock_decrease on public.products;
create trigger trg_10_consume_sellable_expiry_batches_on_stock_decrease
after update of stock on public.products
for each row
when (old.stock is distinct from new.stock and coalesce(new.stock,0) < coalesce(old.stock,0))
execute function public.consume_sellable_expiry_batches_on_stock_decrease();

create or replace function public.refresh_expiry_state_on_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_product_expiry_state(new.id);
  return new;
end;
$$;

drop trigger if exists trg_20_refresh_expiry_state_on_stock_change on public.products;
create trigger trg_20_refresh_expiry_state_on_stock_change
after update of stock on public.products
for each row
when (old.stock is distinct from new.stock)
execute function public.refresh_expiry_state_on_stock_change();

-- A direct/manual product with an expiry date but no batch rows becomes one tracked batch.
create or replace function public.ensure_single_expiry_batch_for_product()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.expiry_date is not null
     and greatest(coalesce(new.stock,0),0) > 0
     and not exists(select 1 from public.product_expiry e where e.product_id=new.id) then
    insert into public.product_expiry(
      product_id,batch_id,expiry_date,quantity,remaining_quantity,created_at,updated_at
    ) values (
      new.id,
      case when nullif(trim(coalesce(new.sku,'')),'') is not null
           then 'MANUAL-'||new.sku
           else 'MANUAL-'||left(new.id::text,8) end,
      new.expiry_date,
      greatest(coalesce(new.stock,0),0),
      greatest(coalesce(new.stock,0),0),
      now(),now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_30_ensure_single_expiry_batch_for_product on public.products;
create trigger trg_30_ensure_single_expiry_batch_for_product
after insert or update of expiry_date,stock on public.products
for each row
execute function public.ensure_single_expiry_batch_for_product();

-- Whole-product expiry-loss capture remains only for truly legacy/untracked products.
create or replace function public.capture_expired_inventory_writeoff()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  effective_expiry date;
  reduction integer;
begin
  if exists(select 1 from public.product_expiry e where e.product_id=new.id) then
    return new;
  end if;

  effective_expiry := new.expiry_date;
  reduction := greatest(coalesce(old.stock,0)-coalesce(new.stock,0),0);

  if reduction > 0
     and effective_expiry is not null
     and effective_expiry < current_date then
    insert into public.inventory_expiry_writeoffs(
      product_id,product_name,sku,expiry_date,quantity,unit_cost,source,created_by
    ) values (
      old.id,
      coalesce(new.name,old.name),
      coalesce(new.sku,old.sku),
      effective_expiry,
      reduction,
      greatest(coalesce(old.cost_price,new.cost_price,0),0),
      'expired_stock_reduction',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

-- Replace whole-product expiry cron with batch-aware refresh.
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname='enforce-product-expiry-20d'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'enforce-product-expiry-20d',
    '5 0 * * *',
    'select public.refresh_all_product_expiry_states();'
  );
end $$;

select public.refresh_all_product_expiry_states();

comment on view public.product_expiry_product_summary is
  'Batch-aware expiry availability. sellable_stock excludes quantities inside the 20-day sales block.';
comment on column public.product_expiry.remaining_quantity is
  'Remaining quantity for this exact expiry/batch entry. Separate boxes/lots keep separate rows.';
