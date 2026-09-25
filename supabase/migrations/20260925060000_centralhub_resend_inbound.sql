-- CentralHub-only Resend email storage. Additive: does not modify tickets or WhatsApp data.
create table if not exists public.centralhub_resend_inbound (
  resend_email_id text primary key,
  message_id text,
  from_address text not null,
  to_addresses text[] not null,
  subject text not null default '',
  body_text text,
  attachments jsonb not null default '[]'::jsonb,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  processing_state text not null default 'unread'
    check (processing_state in ('unread','reviewed','archived')),
  constraint centralhub_resend_inbound_id_length check (char_length(resend_email_id) between 1 and 256)
);
create index if not exists centralhub_resend_inbound_received_idx
 on public.centralhub_resend_inbound(received_at desc);
alter table public.centralhub_resend_inbound enable row level security;
revoke all on public.centralhub_resend_inbound from public, anon, authenticated;
grant all on public.centralhub_resend_inbound to service_role;
-- Deliberately no anon/authenticated policies: email content is private.
-- No triggers or automatic replies. Existing support/WhatsApp data unchanged.
