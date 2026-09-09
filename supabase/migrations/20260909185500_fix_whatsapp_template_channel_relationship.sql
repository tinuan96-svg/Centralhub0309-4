-- whatsapp-template-submit embeds whatsapp_channels through PostgREST. The
-- whatsapp_templates table had channel_id/store_id columns but no foreign keys,
-- so PostgREST could not resolve the relationship and every submission returned
-- "Template or channel configuration not found".

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_templates'::regclass
      and conname = 'whatsapp_templates_channel_id_fkey'
  ) then
    alter table public.whatsapp_templates
      add constraint whatsapp_templates_channel_id_fkey
      foreign key (channel_id) references public.whatsapp_channels(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_templates'::regclass
      and conname = 'whatsapp_templates_store_id_fkey'
  ) then
    alter table public.whatsapp_templates
      add constraint whatsapp_templates_store_id_fkey
      foreign key (store_id) references public.stores(id)
      on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
