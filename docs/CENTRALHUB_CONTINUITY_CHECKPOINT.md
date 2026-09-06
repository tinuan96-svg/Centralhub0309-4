# CentralHub Continuity Checkpoint

Date: 2026-09-06
Canonical repository: `tinuan96-svg/Centralhub0309-4`
Canonical branch: `main`

This checkpoint records the recovery/continuity baseline after the September 2026 repository re-import.

## Continuity-critical surfaces

The CI route audit now protects these pages from silently disappearing from the application or desktop/mobile navigation:

- `/analytics`
- `/site-health`
- `/finance/vat`
- `/settings/notifications`
- `/marketing/apps`
- `/marketing/apps/releases`
- `/inventory/visibility`
- `/settings/master-data/stores`

## Restored and protected areas

- Analytics Intelligence navigation and data surfaces
- Site Health navigation and existing automation backend
- VAT Control UI backed by existing VAT tables
- Notifications & Phone Alerts navigation
- Store Visibility and non-destructive store enable/disable controls
- Store-scoped Business Identity persistence
- App Marketing & Stores navigation
- Manual App Release Manager with private staging and explicit publish actions
- Expiry financial analytics and loss trend visibility
- Hardened order/status/refund sync sources
- Stock adjustment and warehouse movement audit controls
- Finance expense/bank reconciliation visibility and private document access
- Marketing promotion create/edit controls

## Safety rules

- Preserve prior CentralHub functionality; do not silently remove previously implemented features.
- Use this existing repository and `main` branch for CentralHub changes unless explicitly overridden.
- Store removal must remain non-destructive so historic orders, finance, analytics and customer records are preserved.
- App releases must stage privately and require explicit publish actions; uploads must not auto-publish.
- CI must pass lint, route integrity, TypeScript typecheck and production build before a source snapshot is treated as verified.
- Next.js and `eslint-config-next` must remain pinned to `16.3.4`; this removes the broken Next 15.5.x Bolt/WebContainer runtime and must not be replaced by a `node_modules` patch.
- App release artifacts must use resumable TUS uploads with progress and retry support; uploading must never publish automatically.

## Verification

The immediately preceding `main` CI run completed successfully, including lint, continuity route audit, TypeScript typecheck and production build. This checkpoint commit exists primarily to create a short-lived verified source artifact from the current `main` branch.
