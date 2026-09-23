# Tasty Kerala product-feed security contract

CentralHub's read-only `public.tasty_kerala_published_feed(p_after uuid, p_limit integer)` RPC is intentionally callable with an ordinary publishable key. This is safe only because the **server-side query** filters an explicit `store_product_visibility.is_visible=true` assignment for the **fixed** CentralHub store slug `tastykerala`, plus all publication/completeness/expiry/stock checks, and selects only intended public storefront fields. Do not change it to return drafts, cost price, wholesale fields, customer data, other stores or arbitrary store IDs.

Tasty's separate database independently enforces publication requirements and receives rows only through a private authenticated Edge Function. A five-minute reconciliation unpublishes products revoked in CentralHub. Existing stores and their databases/order/payment systems are not changed.

The new Tasty store starts with zero opt-in product assignments. Admin approval and assignment are separate actions. On-site checkout remains disabled until merchant approval.
