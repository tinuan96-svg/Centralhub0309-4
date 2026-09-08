-- Add covering indexes for every remaining public foreign key that lacks one.
-- This is generated from the live catalog so the migration is safe and idempotent.
do $$
declare
  r record;
  idx_name text;
  col_list text;
begin
  for r in
    select
      c.oid as constraint_oid,
      c.conname,
      c.conrelid,
      n.nspname as schema_name,
      t.relname as table_name,
      c.conkey
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indisready
          and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
      )
  loop
    select string_agg(format('%I', a.attname), ', ' order by u.ord)
      into col_list
    from unnest(r.conkey) with ordinality as u(attnum, ord)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = u.attnum;

    idx_name := left(format('idx_fk_%s_%s', r.table_name, substr(md5(r.conname),1,10)), 63);
    execute format('create index if not exists %I on %I.%I (%s)', idx_name, r.schema_name, r.table_name, col_list);
  end loop;
end $$;
