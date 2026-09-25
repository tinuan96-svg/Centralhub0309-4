-- Private HR storage bucket staged but no document uploads are enabled until
-- retention, virus screening, and server-only download authorisation are verified.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('centralhub-hr-private','centralhub-hr-private',false,10485760,
 array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict(id) do nothing;
do $check$
begin
 if not exists(select 1 from storage.buckets where id='centralhub-hr-private' and public=false and file_size_limit=10485760)
 then raise exception 'Existing HR bucket is not configured as private with intended limit'; end if;
end $check$;