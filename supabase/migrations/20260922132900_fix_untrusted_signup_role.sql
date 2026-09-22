-- Security hotfix: auth.user_metadata is writable by the account holder.
-- New users must never choose their authorization role at signup.
-- Existing admin accounts are not changed by this trigger replacement.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles(id,email,full_name,profile_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
