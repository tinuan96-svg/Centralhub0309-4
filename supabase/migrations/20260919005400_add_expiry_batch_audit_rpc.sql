
create or replace function public.replace_product_expiry_batches_for_audit(
  p_product_id uuid,
  p_batches jsonb,
  p_total_stock integer
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
  v_batch text;
begin
  if p_product_id is null then
    raise exception 'product id is required';
  end if;
  if p_total_stock is null or p_total_stock < 0 then
    raise exception 'total stock must be a non-negative number';
  end if;
  if p_batches is null or jsonb_typeof(p_batches) <> 'array' then
    raise exception 'expiry batches must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(p_batches)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;
    v_date := nullif(v_row->>'expiry_date','')::date;
    if v_date is null then
      raise exception 'every non-zero expiry batch needs an expiry date';
    end if;
    v_total := v_total + v_qty;
  end loop;

  if v_total <> p_total_stock then
    raise exception 'expiry batch quantity total (%) must equal audited stock total (%)',v_total,p_total_stock;
  end if;

  delete from public.product_expiry where product_id=p_product_id;

  for v_row in select value from jsonb_array_elements(p_batches)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;
    v_date := nullif(v_row->>'expiry_date','')::date;
    v_batch := nullif(trim(coalesce(v_row->>'batch_id','')),'');

    insert into public.product_expiry(
      product_id,batch_id,expiry_date,quantity,remaining_quantity,created_at,updated_at
    ) values (
      p_product_id,v_batch,v_date,v_qty,v_qty,now(),now()
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

revoke all on function public.replace_product_expiry_batches_for_audit(uuid,jsonb,integer) from public;
grant execute on function public.replace_product_expiry_batches_for_audit(uuid,jsonb,integer) to authenticated,service_role;

comment on function public.replace_product_expiry_batches_for_audit(uuid,jsonb,integer) is
  'Atomically replaces separate expiry box/batch entries during a physical stock audit. Batch quantities must equal the audited total.';
