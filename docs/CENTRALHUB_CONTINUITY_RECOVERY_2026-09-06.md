# CentralHub continuity recovery — 6 September 2026

## Canonical deployment rule

- Repository: `tinuan96-svg/Centralhub0309-4`
- Production branch: `main`
- Do not create replacement repositories or branches unless Tinu explicitly overrides this rule.
- Live CentralHub Supabase project: `icnvrpnzjjcbvgcqgiua`

## Why this file exists

The repository was re-started on 6 September 2026 while the live Supabase project retained a newer database schema and newer Edge Functions. That created a regression risk: a feature could still exist in the backend but disappear from the downloaded/UI source, or a future source-only deployment could mistake a live feature for obsolete code.

Before removing or replacing CentralHub functionality, compare all three sources of truth:

1. current `main` source;
2. live CentralHub Supabase schema/functions/migrations;
3. previously implemented CentralHub behaviour and navigation.

Absence from this repository alone is **not** evidence that a live CentralHub capability is obsolete.

## User-visible features recovered/verified during this audit

- Analytics Intelligence navigation preserved.
- Expiry Management retains expired-stock value and 12-month loss-trend analytics.
- VAT Control Centre and VAT transaction/period visibility preserved.
- Notification & phone-alert settings preserved.
- Store Visibility route restored using the current `store_product_visibility` override layer (not the retired `store_products` architecture).
- App Marketing & Store Analytics route restored using `app_marketing_apps`, `app_marketing_daily_metrics`, `app_marketing_sync_runs`, `app_releases`, and store-isolated provider configuration.
- Desktop and mobile navigation expose the restored App Marketing and VAT areas.

## Live backend capabilities that must not be deleted because source folders are absent

At this audit point the live project contains active Edge Functions beyond the function folders present in the downloaded repository. These include, among others:

- `centralhub-realtime`
- `orders-bidi-sync`
- `backfill-orders`
- `sync-orders-to-centralhub`
- `centralhub-status-webhook`
- `centralhub-product-sync`
- `whatsapp-template-sync`
- `whatsapp-template-submit`
- `whatsapp-template-validate`
- `products`
- `sitemap`
- `store-products-v2`
- `google-analytics-sync`
- `google-analytics-scheduled-sync`
- `marketing-provider-config`
- `site-health-webhook`
- `site-health-readiness`
- `site-health-worker`
- `site-health-deploy-verifier`
- `google-search-console-sync`
- `google-data-pipeline`
- `analytics-public-config`
- `app-release-manager`
- `dhl-invoice-reconcile`
- `mollie-accounting-reconcile`
- `market-discovery`
- `marketing-platform-oauth-config`
- `sync-config-diagnostics`
- `centralhub-auth-verify`
- `google-ads-billing`
- `gmail-finance-reconcile`
- `google-finance-oauth`
- `sync-orders-health`

The live database also contains newer September 6 systems such as app-store marketing, Search Console metrics/URL inspection, app releases, VAT preview/review, Site Health, canonical GitHub registry, finance reconciliation, packaging estimation, automation policies, product-visibility overrides, supplier deduplication and order-sync hardening.

## Regression rules

- Preserve store isolation for marketing, analytics, finance and external platform credentials.
- Preserve manual approval requirements for pricing/competitor decisions; AI must not silently publish price changes.
- Preserve VAT review gates; do not silently mark input VAT recoverable or represent a preview as HMRC-filed.
- Preserve current `products` source-of-truth architecture and do not resurrect retired `store_products`/legacy inventory ownership models just to restore a screen.
- Preserve CentralHub ↔ store order/status/product sync and deduplication safeguards.
- Keep the canonical GitHub `main`-only rule.

## Verification snapshot

During this audit the live CentralHub database reported 419 non-deleted catalog products, 38 expired products, approximately £747.69 of expired stock at stored cost, and 6 registered mobile app identities. The restored Store Visibility screen uses default-visible semantics when no override exists.

This file is a continuity guard, not a replacement for source control. Missing live Edge Function/migration source should be backfilled from the live project before any destructive backend cleanup or full environment rebuild.
