-- Central Email Intelligence Hub. Additive and service-role private.
create table if not exists public.email_hub_messages (
 id uuid primary key default gen_random_uuid(),
 source_provider text not null check (source_provider in ('resend','gmail','outlook','manual')),
 source_account text,
 external_message_id text not null,
 external_thread_id text,
 store_id uuid references public.stores(id) on delete set null,
 from_address text not null default '',
 to_addresses text[] not null default '{}',
 cc_addresses text[] not null default '{}',
 subject text not null default '',
 body_text text,
 attachments jsonb not null default '[]'::jsonb,
 received_at timestamptz not null,
 category text not null default 'unclassified' check (category in ('unclassified','dhl','hmrc','vat','paye','corporation_tax','legal','supplier','customer','banking','payment_provider','finance','hr','security','marketing','other')),
 subcategory text,
 priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
 ai_summary text,
 action_summary text,
 detected_deadline timestamptz,
 detected_amount numeric(14,2),
 detected_currency text,
 sender_verified boolean not null default false,
 confidence numeric(5,4) check (confidence is null or (confidence>=0 and confidence<=1)),
 route_status text not null default 'pending' check (route_status in ('pending','routed','needs_review','processed','failed','ignored')),
 route_target text,
 linked_entity_type text,
 linked_entity_id text,
 processor_result jsonb not null default '{}'::jsonb,
 requires_human_approval boolean not null default false,
 processing_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_provider,source_account,external_message_id)
);
create index if not exists email_hub_received_idx on public.email_hub_messages(received_at desc);
create index if not exists email_hub_category_idx on public.email_hub_messages(category,route_status,received_at desc);
create index if not exists email_hub_store_idx on public.email_hub_messages(store_id,received_at desc);
alter table public.email_hub_messages enable row level security;
revoke all on public.email_hub_messages from public,anon,authenticated;
grant all on public.email_hub_messages to service_role;

create table if not exists public.email_hub_events (
 id bigint generated always as identity primary key,
 message_id uuid not null references public.email_hub_messages(id) on delete cascade,
 event_type text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists email_hub_events_message_idx on public.email_hub_events(message_id,created_at desc);
alter table public.email_hub_events enable row level security;
revoke all on public.email_hub_events from public,anon,authenticated;
grant all on public.email_hub_events to service_role;

create table if not exists public.email_hub_rules (
 id uuid primary key default gen_random_uuid(),
 rule_key text not null unique,
 category text not null,
 sender_domain_pattern text,
 subject_pattern text,
 body_pattern text,
 route_target text not null,
 priority text not null default 'normal',
 auto_process boolean not null default false,
 requires_human_approval boolean not null default true,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.email_hub_rules enable row level security;
revoke all on public.email_hub_rules from public,anon,authenticated;
grant all on public.email_hub_rules to service_role;

insert into public.email_hub_rules(rule_key,category,sender_domain_pattern,subject_pattern,route_target,priority,auto_process,requires_human_approval) values
 ('dhl_invoice','dhl','dhl','invoice|statement|billing','shipping/dhl-reconciliation','normal',true,false),
 ('hmrc','hmrc','hmrc|gov.uk',null,'finance/tax-compliance','high',false,true),
 ('vat','vat',null,'vat|value added tax','finance/vat','high',false,true),
 ('legal','legal',null,'legal|solicitor|court|claim|notice|breach|summons','legal-compliance','critical',false,true),
 ('supplier','supplier',null,'invoice|statement|credit note|purchase order','procurement/supplier-invoices','normal',false,true),
 ('customer','customer',null,'order|delivery|refund|return|complaint','customer-care','normal',false,true)
on conflict(rule_key) do update set category=excluded.category,sender_domain_pattern=excluded.sender_domain_pattern,subject_pattern=excluded.subject_pattern,route_target=excluded.route_target,priority=excluded.priority,auto_process=excluded.auto_process,requires_human_approval=excluded.requires_human_approval,is_active=true,updated_at=now();

insert into public.email_hub_messages(source_provider,source_account,external_message_id,from_address,to_addresses,subject,body_text,attachments,received_at,route_status,processor_result)
select 'resend','centralhub.network',r.resend_email_id,r.from_address,r.to_addresses,r.subject,r.body_text,r.attachments,r.received_at,'pending',jsonb_build_object('migrated_from','centralhub_resend_inbound')
from public.centralhub_resend_inbound r
on conflict(source_provider,source_account,external_message_id) do nothing;
