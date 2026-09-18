
-- Mandatory 20-day expiry sales block.
-- Products may remain active until they reach the 20-day expiry window.
-- From T-20 through expiry/past-expiry they cannot be active or published.
-- Records are retained for expiry reporting; they are not deleted or archived.

create or replace function public.enforce_product_expiry_20d()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.expiry_date is not null
     and new.expiry_date <= current_date + 20 then
    new.is_active := false;
    new.is_published := false;
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

create or replace function public.block_products_inside_expiry_20d()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.products
  set
    is_active = false,
    is_published = false,
    updated_at = now()
  where expiry_date is not null
    and expiry_date <= current_date + 20
    and coalesce(is_deleted,false) = false
    and (
      coalesce(is_active,true) = true
      or coalesce(is_published,true) = true
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.enforce_product_expiry_20d() is
  'Hard sales-safety invariant: at 20 days or less until expiry, a product cannot be active or published.';

comment on function public.block_products_inside_expiry_20d() is
  'Daily enforcement for products crossing into the 20-day expiry window. Keeps rows for expiry reporting.';

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
    'select public.block_products_inside_expiry_20d();'
  );
end $$;

select public.block_products_inside_expiry_20d();
