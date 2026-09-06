drop policy if exists "Users can view their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can insert their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete their push subscriptions" on public.push_subscriptions;

create policy "Users can view their push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can insert their push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete their push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()));
