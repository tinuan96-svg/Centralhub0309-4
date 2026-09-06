# CentralHub marketing implementation

The CB branch keeps marketing integrations store-scoped. A connection is never considered live merely because a database row exists; the UI requires a supported adapter, an external account identifier and a live connection status.

## Live adapters

- Meta: existing store-owned OAuth plus the marketing sync adapter.
- Google: store-owned OAuth plus Google Ads, GA4 and Merchant Center reporting adapters.

## Credential model

Provider client secrets, OAuth access/refresh tokens and Google Ads developer tokens are encrypted server-side with the CentralHub marketing token encryption key. The browser receives only safe connection metadata.

## Store isolation

Every provider configuration, connection, asset, campaign and metric is scoped by `store_id`. All Stores is reporting-only; connecting or managing a provider requires a specific store.

## Sync model

`marketing-sync` refreshes Google access tokens when required and writes normalized campaign/metric data while retaining provider-specific raw metadata for traceability. Partial provider failures are reported instead of silently inventing metrics.
