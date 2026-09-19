
-- Blind stock audit comparison snapshots.
-- System stock/location remain hidden during counting; these snapshots are only used
-- in the completed audit trail to compare expected vs physically entered values.

alter table public.inventory_logs
  add column if not exists system_locations jsonb;

alter table public.inventory_logs
  add column if not exists audited_locations jsonb;

comment on column public.inventory_logs.system_locations is
  'System bin/location snapshot captured before a physical audit is saved.';
comment on column public.inventory_logs.audited_locations is
  'Physical bin/location values entered by staff during the audit.';
