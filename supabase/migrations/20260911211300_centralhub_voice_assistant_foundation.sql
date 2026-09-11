create table if not exists public.voice_assistant_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'operations' check (mode in ('operations','board','developer')),
  input_text text not null,
  response_text text,
  intent text,
  risk_level text not null default 'read_only' check (risk_level in ('read_only','low','medium','high')),
  requires_confirmation boolean not null default false,
  action_name text,
  action_payload jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('completed','pending_confirmation','failed','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists voice_assistant_commands_user_created_idx
  on public.voice_assistant_commands(user_id, created_at desc);

alter table public.voice_assistant_commands enable row level security;

drop policy if exists voice_assistant_commands_select_own on public.voice_assistant_commands;
create policy voice_assistant_commands_select_own
  on public.voice_assistant_commands for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists voice_assistant_commands_insert_own on public.voice_assistant_commands;
create policy voice_assistant_commands_insert_own
  on public.voice_assistant_commands for insert
  to authenticated
  with check (auth.uid() = user_id);
