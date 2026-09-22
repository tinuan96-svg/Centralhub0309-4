-- Issue #4: first audited write workflow for Customer Care staff.
-- Only the server (service_role) may call this transaction; a bearer token
-- cannot invoke it directly over PostgREST. Every call independently checks
-- the staff identity, active approval, permission and assigned store in LIVE DB.
create table if not exists public.ch_staff_activity_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  store_id uuid not null references public.stores(id),
  resource_type text not null,
  resource_id uuid not null,
  action text not null,
  previous_value text,
  next_value text,
  occurred_at timestamptz not null default now()
);
create index if not exists ch_staff_activity_actor_date_idx
on public.ch_staff_activity_audit(actor_id,occurred_at desc);
create index if not exists ch_staff_activity_resource_idx
on public.ch_staff_activity_audit(resource_type,resource_id,occurred_at desc);
alter table public.ch_staff_activity_audit enable row level security;
revoke all on public.ch_staff_activity_audit from public,anon,authenticated;
revoke all on sequence public.ch_staff_activity_audit_id_seq from public,anon,authenticated;

create or replace function public.ch_staff_change_support_status(
  p_actor uuid,
  p_ticket_id uuid,
  p_store_id uuid,
  p_expected_status text,
  p_next_status text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_changed uuid;
begin
  if p_actor is null or p_ticket_id is null or p_store_id is null
     or p_expected_status not in ('open','in_progress','resolved','closed')
     or p_next_status not in ('open','in_progress','resolved','closed')
     or p_expected_status=p_next_status then
    raise exception 'invalid_support_status_request' using errcode='22023';
  end if;

  if not exists (
    select 1 from auth.users u
    join public.user_profiles p on p.id=u.id
    join public.ch_staff_accounts s on s.user_id=u.id
    where u.id=p_actor
      and u.raw_app_meta_data->>'role'='staff'
      and u.raw_app_meta_data->>'must_change_password'='false'
      and p.profile_role='user' and p.is_active=true
      and s.status='active'
      and (s.all_stores or exists (
        select 1 from public.ch_staff_store_access a
        where a.user_id=u.id and a.store_id=p_store_id
      ))
      and coalesce(
        (select o.allowed from public.ch_staff_permission_overrides o
         where o.user_id=u.id and o.permission_key='support.edit'),
        exists (
          select 1 from public.ch_staff_permissions rp
          where rp.role_key=s.role_key and rp.permission_key='support.edit'
        )
      )
      and coalesce(
        (select o.allowed from public.ch_staff_permission_overrides o
         where o.user_id=u.id and o.permission_key='support.view'),
        exists (
          select 1 from public.ch_staff_permissions rp
          where rp.role_key=s.role_key and rp.permission_key='support.view'
        )
      )
  ) then
    raise exception 'staff_support_permission_denied' using errcode='42501';
  end if;

  -- This check is atomic; a concurrent change or wrong store is rejected,
  -- rather than silently overwriting a newer ticket status.
  update public.support_tickets
     set status=p_next_status,
         resolved_at=case when p_next_status in ('resolved','closed')
           then pg_catalog.now() else null end,
         updated_at=pg_catalog.now()
   where id=p_ticket_id and store_id=p_store_id and status=p_expected_status
   returning id into v_changed;
  if v_changed is null then
    raise exception 'ticket_not_found_or_status_changed' using errcode='P0002';
  end if;

  insert into public.ch_staff_activity_audit(
    actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
  ) values (
    p_actor,p_store_id,'support_ticket',v_changed,'change_status',
    p_expected_status,p_next_status
  );
  return v_changed;
end;
$$;
revoke all on function public.ch_staff_change_support_status(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.ch_staff_change_support_status(uuid,uuid,uuid,text,text)
  to service_role;
