drop trigger if exists trg_promote_approved_order_whatsapp_v2 on public.whatsapp_templates;
drop trigger if exists trg_promote_approved_malluspices_rich_whatsapp on public.whatsapp_templates;

-- The latest clean-tracking trigger remains an immediate approval fast-path.
-- The version-aware whatsapp-template-sync worker is the canonical promotion path.
