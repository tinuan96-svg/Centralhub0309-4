-- Reconcile historical delivery logs where Meta evidence is stronger
-- than a stale status overwritten by a late callback.

update public.whatsapp_outbound_log
set status = public.whatsapp_delivery_effective_status(status, delivered_at, read_at, failed_at),
    error_code = case
      when public.whatsapp_delivery_effective_status(status, delivered_at, read_at, failed_at) in ('delivered', 'read') then null
      else error_code
    end,
    error_message = case
      when public.whatsapp_delivery_effective_status(status, delivered_at, read_at, failed_at) in ('delivered', 'read') then null
      else error_message
    end
where public.whatsapp_delivery_effective_status(status, delivered_at, read_at, failed_at) is not null
  and status is distinct from public.whatsapp_delivery_effective_status(status, delivered_at, read_at, failed_at);
