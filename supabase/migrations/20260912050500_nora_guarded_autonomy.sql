-- NORA guarded autonomy stage
-- Adds a dedicated NORA switch and policies for low-risk monitoring/remediation.
-- This intentionally does NOT enable the legacy automation_mode_active flag, so
-- pricing/inventory/customer-impacting automations remain in their existing dry-run
-- / approval-gated state. NORA may only queue issues already approved for the
-- existing guarded site-health autofix pipeline.

insert into public.system_intelligence_settings (key, value, description)
values (
  'automation_nora_enabled',
  true,
  'Enable NORA guarded autonomy scans and low-risk remediation routing'
)
on conflict (key) do update
set description = excluded.description,
    updated_at = now();

insert into public.automation_policies (
  action_type,
  module,
  risk_level,
  requires_approval,
  description,
  is_enabled
)
values
  (
    'nora:diagnostic_scan',
    'nora',
    1,
    false,
    'Read operational health signals and log NORA findings without mutating business-critical data',
    true
  ),
  (
    'nora:site_health_queue',
    'nora',
    1,
    false,
    'Queue only low-risk, no-preview, auto-fix-approved site-health issues into the existing guarded repair pipeline',
    true
  )
on conflict (action_type) do update
set module = excluded.module,
    risk_level = excluded.risk_level,
    requires_approval = excluded.requires_approval,
    description = excluded.description,
    is_enabled = excluded.is_enabled,
    updated_at = now();
