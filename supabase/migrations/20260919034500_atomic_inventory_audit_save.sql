
-- Atomic physical stock audit save.
-- All master stock, bins, movement ledger, audit log and optional expiry rows commit together.
-- Any validation/write error rolls the entire audit back.

create or replace function public.save_inventory_audit_atomic(
  p_product_id uuid,
  p_total_stock integer,
  p_bins jsonb,
  p_expiry_boxes jsonb default null,
  p_units_per_box integer default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_old_stock integer;
  v_change integer;
  v_primary_location text := '';
  v_bin jsonb;
  v_location text;
  v_qty integer;
  v_bin_total integer := 0;
  v_bin_count integer := 0;
  v_system_locations jsonb := '[]'::jsonb;
  v_audited_locations jsonb := '[]'::jsonb;
  v_warehouse uuid;
  v_now timestamptz := now();
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_product_id is null then
    raise exception 'Product is required';
  end if;

  if p_total_stock is null or p_total_stock < 0 then
    raise exception 'Physical stock must be zero or greater';
  end if;

  if p_bins is null or jsonb_typeof(p_bins) <> 'array' then
    raise exception 'Stock locations must be provided';
  end if;

  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_old_stock := greatest(coalesce(v_product.stock,0),0);
  v_change := p_total_stock - v_old_stock;
  v_note := coalesce(nullif(trim(coalesce(p_notes,'')),''),'Physical stock audit');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'location_code', location_code,
        'stock_quantity', stock_quantity
      )
      order by location_code
    ),
    '[]'::jsonb
  )
  into v_system_locations
  from public.product_bin_locations
  where product_id=p_product_id;

  if jsonb_array_length(v_system_locations)=0 then
    v_location := nullif(trim(coalesce(v_product.warehouse_location,'')),'');
    if v_location is null or upper(v_location)='UNASSIGNED' then
      v_location := nullif(trim(coalesce(v_product.bin_location,'')),'');
    end if;
    if v_location is not null then
      v_system_locations := jsonb_build_array(
        jsonb_build_object(
          'location_code',v_location,
          'stock_quantity',v_old_stock
        )
      );
    end if;
  end if;

  for v_bin in select value from jsonb_array_elements(p_bins)
  loop
    v_location := trim(coalesce(v_bin->>'location_code',''));
    v_qty := greatest(coalesce(nullif(v_bin->>'stock_quantity','')::integer,0),0);

    -- Positive physical stock must have a real physical location.
    if p_total_stock > 0 and v_location='' then
      raise exception 'Enter Location / Bin before saving positive stock';
    end if;

    if v_location<>'' then
      v_bin_count := v_bin_count + 1;
      v_bin_total := v_bin_total + v_qty;
      v_audited_locations := v_audited_locations || jsonb_build_array(
        jsonb_build_object(
          'location_code',v_location,
          'stock_quantity',v_qty
        )
      );
      if v_primary_location='' then v_primary_location := v_location; end if;
    elsif v_qty > 0 then
      raise exception 'Every positive stock quantity needs a Location / Bin';
    end if;
  end loop;

  if p_total_stock > 0 and v_bin_count=0 then
    raise exception 'Enter Location / Bin before saving';
  end if;

  if v_bin_total <> p_total_stock then
    raise exception 'Location quantities (%) must equal physical stock total (%)',v_bin_total,p_total_stock;
  end if;

  update public.products
  set
    stock=p_total_stock,
    warehouse_location=case
      when v_primary_location<>'' then v_primary_location
      when p_total_stock=0 then coalesce(nullif(warehouse_location,''),'UNASSIGNED')
      else warehouse_location
    end,
    last_audited_at=v_now,
    last_audited_by=auth.uid(),
    audit_notes=v_note,
    units_per_box=case
      when p_units_per_box is null then units_per_box
      else p_units_per_box
    end,
    updated_at=v_now
  where id=p_product_id;

  delete from public.product_bin_locations
  where product_id=p_product_id;

  for v_bin in select value from jsonb_array_elements(p_bins)
  loop
    v_location := trim(coalesce(v_bin->>'location_code',''));
    v_qty := greatest(coalesce(nullif(v_bin->>'stock_quantity','')::integer,0),0);

    if v_location<>'' then
      insert into public.product_bin_locations(
        product_id,location_code,stock_quantity,last_audited_at,created_at,updated_at
      ) values (
        p_product_id,v_location,v_qty,v_now,v_now,v_now
      );
    end if;
  end loop;

  if v_change <> 0 then
    select id into v_warehouse
    from public.warehouses
    where is_active=true
    order by created_at asc
    limit 1;

    insert into public.inventory_movements(
      product_id,warehouse_id,change_amount,old_stock,new_stock,action_type,notes,created_at
    ) values (
      p_product_id,v_warehouse,v_change,v_old_stock,p_total_stock,'ADJUST',v_note,v_now
    );
  end if;

  insert into public.inventory_logs(
    product_id,change,old_quantity,new_quantity,type,movement_type,reason,notes,
    system_locations,audited_locations,edited_by,created_at
  ) values (
    p_product_id,v_change,v_old_stock,p_total_stock,'AUDIT','AUDIT',
    'Physical Stock Audit (Multi-Location)',v_note,
    v_system_locations,v_audited_locations,auth.uid(),v_now
  );

  if p_expiry_boxes is not null then
    perform public.replace_product_expiry_boxes_for_audit(
      p_product_id,
      p_expiry_boxes,
      p_total_stock,
      p_units_per_box
    );

    update public.inventory_audit_label_photos
    set
      status='confirmed',
      confirmed_at=v_now,
      updated_at=v_now
    where id in (
      select nullif(value->>'label_photo_id','')::uuid
      from jsonb_array_elements(p_expiry_boxes)
      where nullif(value->>'label_photo_id','') is not null
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'product_id',p_product_id,
    'old_stock',v_old_stock,
    'new_stock',p_total_stock,
    'change',v_change,
    'location_count',v_bin_count
  );
end;
$$;

revoke all on function public.save_inventory_audit_atomic(uuid,integer,jsonb,jsonb,integer,text) from public;
grant execute on function public.save_inventory_audit_atomic(uuid,integer,jsonb,jsonb,integer,text)
to authenticated,service_role;

comment on function public.save_inventory_audit_atomic(uuid,integer,jsonb,jsonb,integer,text) is
  'Atomically saves a blind physical stock audit. Any error rolls back stock, bins, ledger, audit log and expiry changes together.';
