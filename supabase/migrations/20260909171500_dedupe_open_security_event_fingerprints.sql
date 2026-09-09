-- Keep the live security radar truthful: one unresolved incident per exact condition.
create unique index if not exists security_events_one_open_fingerprint_uidx
on public.security_events(fingerprint)
where fingerprint is not null and status in ('open','acknowledged');
