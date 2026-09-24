# Kerala Groceries — Tasty Kerala LTD (separate store)

CentralHub store identity: internal slug `tastykerala`, domain `keralagroceries.com`, dedicated Supabase project `mlytdvhwvjiyfchtejli`. The original `keralagrocery.com` / `keralagrocery` identity and database are unchanged.

## Product propagation
The private `tasty_kerala_operational_snapshot()` builds an allowlisted set of all CentralHub SKU records, stock (expiry-adjusted), price, cost, operational statuses, category/image/description/SEO and variant links. `tasty_kerala_push_operational_snapshot()` sends it to the Tasty-local Edge receiver through pg_net every five minutes using the CentralHub Vault token. Tasty verifies the caller over HTTPS using CentralHub's dedicated custom-auth Edge Function, which privately calls a service-role-only Vault verifier; no CentralHub service role key or secret is committed into a repository.

The Tasty receiver mirrors all CentralHub records in private RLS-protected raw tables, stages corresponding records in `shop_products`, and applies the existing explicit Tasty store visibility + central approval + quality + stock + expiry safeguards. A raw mirror record does **not** mean a product can be purchased or seen publicly. No order, payment or warehouse stock operation is performed.

## Operational checks
Verify CentralHub `cron.job` job `tasty-kerala-raw-product-sync`, private `net._http_response` status, Tasty `tasty_raw_sync_runs`, source-vs-mirror row counts, and approved `shop_products` visibility. Do not bulk-approve or silently assign products in production. If sync fails, inspect the separate private audits; do not switch the website to a public unapproved feed.
