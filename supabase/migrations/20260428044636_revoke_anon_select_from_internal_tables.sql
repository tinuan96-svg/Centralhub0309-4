/*
  # Revoke anon SELECT from Internal/Admin Tables

  Removes SELECT access from the anon role for tables that should not be
  publicly discoverable via the GraphQL schema or REST API without authentication.

  Tables kept accessible to anon (required for public storefront):
  - keralagroceries, store_products, store_product_variants, stores, store_settings,
    store_categories, store_category_assignments, main_categories, products,
    product_variants, product_images, brands, banners, carousel_banners, promotions,
    categories, homepage_section_products, v_storefront_products, pricing_rules_with_scope

  Tables revoked from anon (internal/admin only):
  - image_processing_jobs, ingestion_jobs, media_product_mappings, notifications,
    order_notifications, product_marketing_tags, product_metrics,
    sender_profiles, store_brand_assignments
*/

REVOKE SELECT ON public.image_processing_jobs FROM anon;
REVOKE SELECT ON public.ingestion_jobs FROM anon;
REVOKE SELECT ON public.media_product_mappings FROM anon;
REVOKE SELECT ON public.notifications FROM anon;
REVOKE SELECT ON public.order_notifications FROM anon;
REVOKE SELECT ON public.product_marketing_tags FROM anon;
REVOKE SELECT ON public.product_metrics FROM anon;
REVOKE SELECT ON public.sender_profiles FROM anon;
