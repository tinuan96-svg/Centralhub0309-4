
-- Inventory audit label photos and remembered expiry dates.
-- Photos are private evidence for a physical box/carton and may be analysed to prefill
-- label fields. Existing expiry dates may be reused during a blind audit; stock/location
-- values remain hidden until after save.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'inventory-audit-labels',
  'inventory-audit-labels',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.inventory_audit_label_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  file_name text,
  mime_type text,
  status text not null default 'uploaded'
    check (status in ('uploaded','analysing','analysed','confirmed','failed')),
  extracted_data jsonb not null default '{}'::jsonb,
  confidence numeric(5,4),
  error_message text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  analysed_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_audit_label_photos_product_created
  on public.inventory_audit_label_photos(product_id,created_at desc);

alter table public.inventory_audit_label_photos enable row level security;

drop policy if exists inventory_audit_label_photos_authenticated_select on public.inventory_audit_label_photos;
create policy inventory_audit_label_photos_authenticated_select
on public.inventory_audit_label_photos
for select to authenticated
using (true);

drop policy if exists inventory_audit_label_photos_authenticated_insert on public.inventory_audit_label_photos;
create policy inventory_audit_label_photos_authenticated_insert
on public.inventory_audit_label_photos
for insert to authenticated
with check (created_by=auth.uid() or created_by is null);

drop policy if exists inventory_audit_label_photos_authenticated_update on public.inventory_audit_label_photos;
create policy inventory_audit_label_photos_authenticated_update
on public.inventory_audit_label_photos
for update to authenticated
using (true)
with check (true);

drop policy if exists inventory_audit_label_photos_authenticated_delete on public.inventory_audit_label_photos;
create policy inventory_audit_label_photos_authenticated_delete
on public.inventory_audit_label_photos
for delete to authenticated
using (true);

grant select,insert,update,delete on public.inventory_audit_label_photos to authenticated;

drop policy if exists inventory_audit_labels_storage_select on storage.objects;
create policy inventory_audit_labels_storage_select
on storage.objects
for select to authenticated
using (bucket_id='inventory-audit-labels');

drop policy if exists inventory_audit_labels_storage_insert on storage.objects;
create policy inventory_audit_labels_storage_insert
on storage.objects
for insert to authenticated
with check (bucket_id='inventory-audit-labels');

drop policy if exists inventory_audit_labels_storage_update on storage.objects;
create policy inventory_audit_labels_storage_update
on storage.objects
for update to authenticated
using (bucket_id='inventory-audit-labels')
with check (bucket_id='inventory-audit-labels');

drop policy if exists inventory_audit_labels_storage_delete on storage.objects;
create policy inventory_audit_labels_storage_delete
on storage.objects
for delete to authenticated
using (bucket_id='inventory-audit-labels');

alter table public.product_expiry
  add column if not exists manufacture_date date,
  add column if not exists carton_no text,
  add column if not exists label_photo_id uuid references public.inventory_audit_label_photos(id) on delete set null;

create or replace function public.replace_product_expiry_boxes_for_audit(
  p_product_id uuid,
  p_boxes jsonb,
  p_total_stock integer,
  p_units_per_box integer default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  v_row jsonb;
  v_qty integer;
  v_date date;
  v_mfg date;
  v_lot text;
  v_carton text;
  v_photo uuid;
  v_box integer;
  v_count integer := 0;
begin
  if p_product_id is null then
    raise exception 'product id is required';
  end if;
  if p_total_stock is null or p_total_stock < 0 then
    raise exception 'total stock must be a non-negative number';
  end if;
  if p_units_per_box is not null and p_units_per_box <= 0 then
    raise exception 'units per box must be greater than zero';
  end if;
  if p_boxes is null or jsonb_typeof(p_boxes) <> 'array' then
    raise exception 'expiry boxes must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(p_boxes)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;

    v_date := nullif(v_row->>'expiry_date','')::date;
    if v_date is null then
      raise exception 'every non-zero expiry box needs an expiry date';
    end if;

    if p_units_per_box is not null and v_qty > p_units_per_box then
      raise exception 'box quantity (%) cannot exceed units per box (%)',v_qty,p_units_per_box;
    end if;

    v_total := v_total + v_qty;
    v_count := v_count + 1;
  end loop;

  if v_count > 0 and v_total <> p_total_stock then
    raise exception 'expiry box quantity total (%) must equal audited stock total (%)',v_total,p_total_stock;
  end if;

  update public.products
  set units_per_box=p_units_per_box,
      updated_at=now()
  where id=p_product_id
    and units_per_box is distinct from p_units_per_box;

  delete from public.product_expiry where product_id=p_product_id;

  v_box := 0;
  for v_row in select value from jsonb_array_elements(p_boxes)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;

    v_date := nullif(v_row->>'expiry_date','')::date;
    v_mfg := nullif(v_row->>'manufacture_date','')::date;
    v_lot := nullif(trim(coalesce(v_row->>'batch_id','')),'');
    v_carton := nullif(trim(coalesce(v_row->>'carton_no','')),'');
    v_photo := nullif(v_row->>'label_photo_id','')::uuid;
    v_box := v_box + 1;

    insert into public.product_expiry(
      product_id,batch_id,box_number,expiry_date,manufacture_date,carton_no,label_photo_id,
      quantity,remaining_quantity,created_at,updated_at
    ) values (
      p_product_id,
      v_lot,
      coalesce(nullif(v_row->>'box_number','')::integer,v_box),
      v_date,
      v_mfg,
      v_carton,
      v_photo,
      v_qty,
      v_qty,
      now(),
      now()
    );
  end loop;

  update public.products
  set expiry_date=(
    select min(expiry_date)
    from public.product_expiry
    where product_id=p_product_id and remaining_quantity>0
  ),
  updated_at=now()
  where id=p_product_id;

  perform public.refresh_product_expiry_state(p_product_id);
end;
$$;

comment on table public.inventory_audit_label_photos is
  'Private carton/box label photos uploaded during inventory audit. AI extraction is review-only and never changes stock automatically.';
comment on column public.product_expiry.label_photo_id is
  'Optional evidence photo for this physical expiry box.';
