
-- Full stock-audit reconciliation:
-- anything with system stock that is not physically counted is quarantined at finalisation.
-- Quarantine means stock=0, inactive and unpublished until explicitly resolved.

create table if not exists public.inventory_audit_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open'
    check (status in ('open','finalized','cancelled')),
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  started_by uuid references auth.users(id) on delete set null default auth.uid(),
  finalized_by uuid references auth.users(id) on delete set null,
  notes text,
  snapshot_product_count integer not null default 0,
  counted_product_count integer not null default 0,
  missing_product_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_audit_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inventory_audit_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  status text not null default 'pending_count'
    check (status in (
      'pending_count',
      'counted',
      'missing_pending',
      'confirmed_found',
      'not_found',
      'damaged',
      'expired'
    )),
  system_stock_before integer not null default 0,
  system_stock_at_finalize integer,
  physical_count integer,
  quarantined_stock integer,
  previous_is_active boolean,
  previous_is_published boolean,
  counted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,product_id)
);

create index if not exists idx_inventory_audit_sessions_status_started
  on public.inventory_audit_sessions(status,started_at desc);
create index if not exists idx_inventory_audit_session_items_session_status
  on public.inventory_audit_session_items(session_id,status);
create index if not exists idx_inventory_audit_session_items_product
  on public.inventory_audit_session_items(product_id,created_at desc);

alter table public.products
  add column if not exists audit_hold_status text not null default 'none';
alter table public.products
  add column if not exists audit_hold_session_id uuid references public.inventory_audit_sessions(id) on delete set null;
alter table public.products
  add column if not exists audit_hold_at timestamptz;
alter table public.products
  add column if not exists audit_hold_reason text;
alter table public.products
  add column if not exists audit_prev_stock integer;
alter table public.products
  add column if not exists audit_prev_is_active boolean;
alter table public.products
  add column if not exists audit_prev_is_published boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_audit_hold_status_check'
  ) then
    alter table public.products
      add constraint products_audit_hold_status_check
      check (audit_hold_status in ('none','missing_pending','not_found','damaged','expired'));
  end if;
end $$;

alter table public.inventory_audit_sessions enable row level security;
alter table public.inventory_audit_session_items enable row level security;

drop policy if exists inventory_audit_sessions_authenticated on public.inventory_audit_sessions;
create policy inventory_audit_sessions_authenticated
on public.inventory_audit_sessions
for all to authenticated
using (true)
with check (true);

drop policy if exists inventory_audit_session_items_authenticated on public.inventory_audit_session_items;
create policy inventory_audit_session_items_authenticated
on public.inventory_audit_session_items
for all to authenticated
using (true)
with check (true);

grant select,insert,update on public.inventory_audit_sessions to authenticated;
grant select,insert,update on public.inventory_audit_session_items to authenticated;

create or replace function public.start_full_inventory_audit(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session uuid;
  v_count integer;
begin
  select id into v_session
  from public.inventory_audit_sessions
  where status='open'
  order by started_at desc
  limit 1;

  if v_session is not null then
    return v_session;
  end if;

  insert into public.inventory_audit_sessions(notes,started_by)
  values (nullif(trim(coalesce(p_notes,'')),''),auth.uid())
  returning id into v_session;

  insert into public.inventory_audit_session_items(
    session_id,product_id,status,system_stock_before,previous_is_active,previous_is_published
  )
  select
    v_session,p.id,'pending_count',greatest(coalesce(p.stock,0),0),
    coalesce(p.is_active,false),coalesce(p.is_published,false)
  from public.products p
  where coalesce(p.is_deleted,false)=false
    and greatest(coalesce(p.stock,0),0) > 0;

  get diagnostics v_count = row_count;

  update public.inventory_audit_sessions
  set snapshot_product_count=v_count,updated_at=now()
  where id=v_session;

  return v_session;
end;
$$;

create or replace function public.capture_open_inventory_audit_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session uuid;
begin
  if upper(coalesce(new.type,'')) <> 'AUDIT' or new.product_id is null then
    return new;
  end if;

  select id into v_session
  from public.inventory_audit_sessions
  where status='open'
  order by started_at desc
  limit 1;

  if v_session is null then
    return new;
  end if;

  insert into public.inventory_audit_session_items(
    session_id,product_id,status,system_stock_before,physical_count,
    previous_is_active,previous_is_published,counted_at,updated_at
  )
  select
    v_session,
    new.product_id,
    'counted',
    greatest(coalesce(new.old_quantity,0),0),
    greatest(coalesce(new.new_quantity,0),0),
    coalesce(p.is_active,false),
    coalesce(p.is_published,false),
    coalesce(new.created_at,now()),
    now()
  from public.products p
  where p.id=new.product_id
  on conflict(session_id,product_id) do update
    set status='counted',
        physical_count=greatest(coalesce(excluded.physical_count,0),0),
        counted_at=excluded.counted_at,
        updated_at=now();

  update public.inventory_audit_sessions s
  set counted_product_count=(
        select count(*) from public.inventory_audit_session_items i
        where i.session_id=s.id and i.status='counted'
      ),
      updated_at=now()
  where s.id=v_session;

  return new;
end;
$$;

drop trigger if exists trg_capture_open_inventory_audit_count on public.inventory_logs;
create trigger trg_capture_open_inventory_audit_count
after insert on public.inventory_logs
for each row
execute function public.capture_open_inventory_audit_count();

create or replace function public.finalize_full_inventory_audit(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing integer := 0;
  r record;
begin
  if not exists (
    select 1 from public.inventory_audit_sessions
    where id=p_session_id and status='open'
  ) then
    raise exception 'Open inventory audit session not found';
  end if;

  -- Include stock added after the session began so current positive system stock
  -- cannot escape the full-audit comparison.
  insert into public.inventory_audit_session_items(
    session_id,product_id,status,system_stock_before,previous_is_active,previous_is_published
  )
  select
    p_session_id,p.id,'pending_count',greatest(coalesce(p.stock,0),0),
    coalesce(p.is_active,false),coalesce(p.is_published,false)
  from public.products p
  where coalesce(p.is_deleted,false)=false
    and greatest(coalesce(p.stock,0),0) > 0
    and not exists (
      select 1 from public.inventory_audit_session_items i
      where i.session_id=p_session_id and i.product_id=p.id
    )
  on conflict do nothing;

  for r in
    select
      i.id as item_id,
      p.id as product_id,
      greatest(coalesce(p.stock,0),0) as current_stock,
      coalesce(p.is_active,false) as current_active,
      coalesce(p.is_published,false) as current_published
    from public.inventory_audit_session_items i
    join public.products p on p.id=i.product_id
    where i.session_id=p_session_id
      and i.status='pending_count'
      and coalesce(p.is_deleted,false)=false
      and greatest(coalesce(p.stock,0),0) > 0
    for update of p
  loop
    update public.inventory_audit_session_items
    set status='missing_pending',
        system_stock_at_finalize=r.current_stock,
        quarantined_stock=r.current_stock,
        previous_is_active=r.current_active,
        previous_is_published=r.current_published,
        updated_at=now()
    where id=r.item_id;

    update public.products
    set
      audit_hold_status='missing_pending',
      audit_hold_session_id=p_session_id,
      audit_hold_at=now(),
      audit_hold_reason='Not physically counted in finalized full stock audit',
      audit_prev_stock=r.current_stock,
      audit_prev_is_active=r.current_active,
      audit_prev_is_published=r.current_published,
      stock=0,
      is_active=false,
      is_published=false,
      updated_at=now()
    where id=r.product_id;

    insert into public.inventory_logs(
      product_id,change,old_quantity,new_quantity,type,movement_type,reason,notes,edited_by,created_at
    ) values (
      r.product_id,
      -r.current_stock,
      r.current_stock,
      0,
      'AUDIT_HOLD',
      'AUDIT_HOLD',
      'Full stock audit: not counted',
      'Temporarily quarantined at zero until found/not-found/damaged/expired is confirmed.',
      auth.uid(),
      now()
    );

    v_missing := v_missing + 1;
  end loop;

  update public.inventory_audit_sessions s
  set status='finalized',
      finalized_at=now(),
      finalized_by=auth.uid(),
      snapshot_product_count=(
        select count(*) from public.inventory_audit_session_items i where i.session_id=s.id
      ),
      counted_product_count=(
        select count(*) from public.inventory_audit_session_items i
        where i.session_id=s.id and i.status='counted'
      ),
      missing_product_count=v_missing,
      updated_at=now()
  where s.id=p_session_id;

  return v_missing;
end;
$$;

create or replace function public.resolve_inventory_audit_exception(
  p_item_id uuid,
  p_resolution text,
  p_confirmed_stock integer default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.inventory_audit_session_items%rowtype;
  v_product public.products%rowtype;
  v_resolution text;
  v_qty integer;
  v_restore_active boolean;
  v_restore_published boolean;
begin
  v_resolution := lower(trim(coalesce(p_resolution,'')));
  if v_resolution not in ('found','not_found','damaged','expired') then
    raise exception 'Unsupported resolution: %',p_resolution;
  end if;

  select * into v_item
  from public.inventory_audit_session_items
  where id=p_item_id
  for update;

  if not found or v_item.status <> 'missing_pending' then
    raise exception 'Pending audit exception not found';
  end if;

  select * into v_product
  from public.products
  where id=v_item.product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_resolution='found' then
    if p_confirmed_stock is null or p_confirmed_stock < 0 then
      raise exception 'Confirmed stock is required when product is found';
    end if;

    v_qty := p_confirmed_stock;
    v_restore_active :=
      coalesce(v_product.audit_prev_is_active,false)
      and not coalesce(v_product.expiry_blocked,false);
    v_restore_published :=
      coalesce(v_product.audit_prev_is_published,false)
      and lower(coalesce(v_product.approval_status,''))='approved'
      and not coalesce(v_product.expiry_blocked,false)
      and v_qty > 0;

    update public.products
    set
      stock=v_qty,
      is_active=v_restore_active and v_qty > 0,
      is_published=v_restore_published,
      audit_hold_status='none',
      audit_hold_session_id=null,
      audit_hold_at=null,
      audit_hold_reason=null,
      audit_prev_stock=null,
      audit_prev_is_active=null,
      audit_prev_is_published=null,
      updated_at=now()
    where id=v_product.id;

    update public.inventory_audit_session_items
    set status='confirmed_found',
        physical_count=v_qty,
        resolved_at=now(),
        resolved_by=auth.uid(),
        resolution_note=nullif(trim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=p_item_id;

    insert into public.inventory_logs(
      product_id,change,old_quantity,new_quantity,type,movement_type,reason,notes,edited_by,created_at
    ) values (
      v_product.id,
      v_qty,
      0,
      v_qty,
      'AUDIT',
      'AUDIT_RESOLUTION',
      'Full stock audit: product found and confirmed',
      nullif(trim(coalesce(p_note,'')),''),
      auth.uid(),
      now()
    );
  else
    update public.products
    set
      stock=0,
      is_active=false,
      is_published=false,
      audit_hold_status=case
        when v_resolution='not_found' then 'not_found'
        when v_resolution='damaged' then 'damaged'
        else 'expired'
      end,
      audit_hold_reason=case
        when v_resolution='not_found' then 'Confirmed not found after full stock audit'
        when v_resolution='damaged' then 'Confirmed damaged after full stock audit'
        else 'Confirmed expired after full stock audit'
      end,
      updated_at=now()
    where id=v_product.id;

    update public.inventory_audit_session_items
    set status=v_resolution,
        physical_count=0,
        resolved_at=now(),
        resolved_by=auth.uid(),
        resolution_note=nullif(trim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=p_item_id;

    insert into public.inventory_logs(
      product_id,change,old_quantity,new_quantity,type,movement_type,reason,notes,edited_by,created_at
    ) values (
      v_product.id,
      -greatest(coalesce(v_item.quarantined_stock,0),0),
      greatest(coalesce(v_item.quarantined_stock,0),0),
      0,
      case when v_resolution='damaged' then 'DAMAGE'
           when v_resolution='expired' then 'EXPIRY'
           else 'AUDIT' end,
      'AUDIT_RESOLUTION',
      case when v_resolution='damaged' then 'Full stock audit: confirmed damaged'
           when v_resolution='expired' then 'Full stock audit: confirmed expired'
           else 'Full stock audit: confirmed not found' end,
      nullif(trim(coalesce(p_note,'')),''),
      auth.uid(),
      now()
    );

    if v_resolution='expired' and greatest(coalesce(v_item.quarantined_stock,0),0) > 0 then
      insert into public.inventory_expiry_writeoffs(
        product_id,product_name,sku,expiry_date,quantity,unit_cost,source,note,created_by
      ) values (
        v_product.id,
        coalesce(v_product.name,'Unknown Product'),
        v_product.sku,
        coalesce(v_product.expiry_date,current_date),
        greatest(coalesce(v_item.quarantined_stock,0),0),
        greatest(coalesce(v_product.cost_price,0),0),
        'full_stock_audit_expired',
        nullif(trim(coalesce(p_note,'')),''),
        auth.uid()
      );
    end if;
  end if;
end;
$$;

-- Quarantining a missing product is not a sale. Do not consume expiry batches
-- merely because its storefront stock is temporarily forced to zero.
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
  if coalesce(new.audit_hold_status,'none') <> 'none' then
    return new;
  end if;

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

revoke all on function public.start_full_inventory_audit(text) from public;
revoke all on function public.finalize_full_inventory_audit(uuid) from public;
revoke all on function public.resolve_inventory_audit_exception(uuid,text,integer,text) from public;
grant execute on function public.start_full_inventory_audit(text) to authenticated,service_role;
grant execute on function public.finalize_full_inventory_audit(uuid) to authenticated,service_role;
grant execute on function public.resolve_inventory_audit_exception(uuid,text,integer,text) to authenticated,service_role;

comment on table public.inventory_audit_sessions is
  'Full physical stock-audit runs. Uncounted positive system stock is quarantined only when a run is finalized.';
comment on column public.products.audit_hold_status is
  'none, missing_pending, not_found, damaged or expired. missing_pending forces zero/unpublished until manually resolved.';
