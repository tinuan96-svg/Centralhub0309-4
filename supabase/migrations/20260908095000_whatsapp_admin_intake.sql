-- CentralHub WhatsApp Admin Intake
-- Isolates the private CentralHub admin number from store/customer WhatsApp channels.
-- All extracted accounting/VAT/product actions are review-first.

alter table public.whatsapp_channels
  add column if not exists channel_purpose text not null default 'store_customer',
  add column if not exists admin_intake_enabled boolean not null default false,
  add column if not exists authorized_sender_phones text[] not null default '{}'::text[];

alter table public.whatsapp_channels drop constraint if exists whatsapp_channels_channel_purpose_check;
alter table public.whatsapp_channels add constraint whatsapp_channels_channel_purpose_check check (channel_purpose in ('store_customer','admin_intake'));

create unique index if not exists whatsapp_channels_single_admin_intake_idx on public.whatsapp_channels (channel_purpose) where channel_purpose = 'admin_intake';

create table if not exists public.whatsapp_admin_intake_items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  wa_message_id text not null unique,
  sender_phone text not null,
  sender_name text,
  message_type text not null,
  message_text text,
  media_id text,
  media_mime_type text,
  media_filename text,
  media_storage_path text,
  media_size bigint,
  media_sha256 text,
  status text not null default 'received',
  intake_type text not null default 'other',
  route_section text not null default 'review',
  target_store_id uuid references public.stores(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  suggested_ledger_account_id uuid references public.finance_ledger_accounts(id) on delete set null,
  confidence numeric,
  extracted_data jsonb not null default '{}'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  duplicate_of_id uuid references public.whatsapp_admin_intake_items(id) on delete set null,
  finance_document_id uuid,
  reply_wa_message_id text,
  reply_status text,
  reply_error_message text,
  error_message text,
  review_notes text,
  processed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_admin_intake_items drop constraint if exists whatsapp_admin_intake_items_status_check;
alter table public.whatsapp_admin_intake_items add constraint whatsapp_admin_intake_items_status_check check (status in ('received','media_stored','processing','ready','needs_review','duplicate','rejected','error','reviewed'));
alter table public.whatsapp_admin_intake_items drop constraint if exists whatsapp_admin_intake_items_type_check;
alter table public.whatsapp_admin_intake_items add constraint whatsapp_admin_intake_items_type_check check (intake_type in ('invoice','bill','receipt','payment_receipt','statement','credit_note','order_confirmation','supplier_price_list','delivery_note','instruction','other'));
alter table public.whatsapp_admin_intake_items drop constraint if exists whatsapp_admin_intake_items_route_check;
alter table public.whatsapp_admin_intake_items add constraint whatsapp_admin_intake_items_route_check check (route_section in ('finance','vat','suppliers_pricing','procurement','inventory','orders','marketing','customer_care','settings','review'));
alter table public.whatsapp_admin_intake_items drop constraint if exists whatsapp_admin_intake_items_confidence_check;
alter table public.whatsapp_admin_intake_items add constraint whatsapp_admin_intake_items_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists whatsapp_admin_intake_status_created_idx on public.whatsapp_admin_intake_items(status, created_at desc);
create index if not exists whatsapp_admin_intake_store_created_idx on public.whatsapp_admin_intake_items(target_store_id, created_at desc);
create index if not exists whatsapp_admin_intake_sha_idx on public.whatsapp_admin_intake_items(media_sha256) where media_sha256 is not null;

alter table public.finance_documents
  add column if not exists whatsapp_admin_intake_id uuid,
  add column if not exists suggested_ledger_account_id uuid references public.finance_ledger_accounts(id) on delete set null,
  add column if not exists suggested_accounting_treatment text,
  add column if not exists classification_confidence numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='finance_documents_whatsapp_admin_intake_id_fkey' and conrelid='public.finance_documents'::regclass) then
    alter table public.finance_documents add constraint finance_documents_whatsapp_admin_intake_id_fkey foreign key (whatsapp_admin_intake_id) references public.whatsapp_admin_intake_items(id) on delete set null;
  end if;
end $$;

create unique index if not exists finance_documents_whatsapp_admin_intake_uidx on public.finance_documents(whatsapp_admin_intake_id) where whatsapp_admin_intake_id is not null;
alter table public.finance_documents drop constraint if exists finance_documents_source_type_check;
alter table public.finance_documents add constraint finance_documents_source_type_check check (source_type in ('gmail','manual','upload','dhl_import','whatsapp','other'));
alter table public.finance_documents drop constraint if exists finance_documents_classification_confidence_check;
alter table public.finance_documents add constraint finance_documents_classification_confidence_check check (classification_confidence is null or (classification_confidence >= 0 and classification_confidence <= 1));

alter table public.whatsapp_admin_intake_items enable row level security;
drop policy if exists "Admins can view WhatsApp admin intake" on public.whatsapp_admin_intake_items;
create policy "Admins can view WhatsApp admin intake" on public.whatsapp_admin_intake_items for select to authenticated using (public.is_admin());
drop policy if exists "Admins can update WhatsApp admin intake" on public.whatsapp_admin_intake_items;
create policy "Admins can update WhatsApp admin intake" on public.whatsapp_admin_intake_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins can insert WhatsApp admin intake" on public.whatsapp_admin_intake_items;
create policy "Admins can insert WhatsApp admin intake" on public.whatsapp_admin_intake_items for insert to authenticated with check (public.is_admin());

create or replace function public.configure_whatsapp_admin_intake_channel(
  p_business_name text default 'CentralHub Admin Intake',
  p_waba_id text default null,
  p_phone_number_id text default null,
  p_display_phone_number text default null,
  p_access_token text default null,
  p_verify_token text default null,
  p_app_secret text default null,
  p_authorized_sender_phones text[] default '{}'::text[],
  p_enabled boolean default true
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; v_senders text[];
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select coalesce(array_agg(distinct normalized) filter (where normalized <> ''), '{}'::text[]) into v_senders
  from (select regexp_replace(coalesce(x,''), '[^0-9]', '', 'g') as normalized from unnest(coalesce(p_authorized_sender_phones, '{}'::text[])) x) s;
  select id into v_id from public.whatsapp_channels where channel_purpose='admin_intake' limit 1;
  if v_id is null then
    insert into public.whatsapp_channels (store_id,business_name,waba_id,phone_number_id,display_phone_number,access_token,verify_token,app_secret,status,channel_purpose,admin_intake_enabled,authorized_sender_phones,created_at,updated_at)
    values (null,coalesce(nullif(trim(p_business_name),''),'CentralHub Admin Intake'),nullif(trim(p_waba_id),''),nullif(trim(p_phone_number_id),''),nullif(trim(p_display_phone_number),''),nullif(trim(p_access_token),''),nullif(trim(p_verify_token),''),nullif(trim(p_app_secret),''),'inactive','admin_intake',p_enabled,v_senders,now(),now()) returning id into v_id;
  else
    update public.whatsapp_channels set store_id=null,business_name=coalesce(nullif(trim(p_business_name),''),business_name,'CentralHub Admin Intake'),waba_id=coalesce(nullif(trim(p_waba_id),''),waba_id),phone_number_id=coalesce(nullif(trim(p_phone_number_id),''),phone_number_id),display_phone_number=coalesce(nullif(trim(p_display_phone_number),''),display_phone_number),access_token=coalesce(nullif(trim(p_access_token),''),access_token),verify_token=coalesce(nullif(trim(p_verify_token),''),verify_token),app_secret=coalesce(nullif(trim(p_app_secret),''),app_secret),channel_purpose='admin_intake',admin_intake_enabled=p_enabled,authorized_sender_phones=case when cardinality(v_senders)>0 then v_senders else authorized_sender_phones end,updated_at=now() where id=v_id;
  end if;
  update public.whatsapp_channels set status=case when admin_intake_enabled and coalesce(phone_number_id,'')<>'' and coalesce(waba_id,'')<>'' and coalesce(access_token,'')<>'' and coalesce(verify_token,'')<>'' and coalesce(app_secret,'')<>'' and cardinality(authorized_sender_phones)>0 then 'active' else 'inactive' end,updated_at=now() where id=v_id;
  return v_id;
end; $$;

revoke all on function public.configure_whatsapp_admin_intake_channel(text,text,text,text,text,text,text,text[],boolean) from public;
grant execute on function public.configure_whatsapp_admin_intake_channel(text,text,text,text,text,text,text,text[],boolean) to authenticated;
comment on table public.whatsapp_admin_intake_items is 'Private CentralHub WhatsApp admin intake queue. Source evidence is immutable; AI suggestions remain review-first.';
