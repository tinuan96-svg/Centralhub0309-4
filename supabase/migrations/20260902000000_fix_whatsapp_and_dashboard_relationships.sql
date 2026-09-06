-- The live MalluSpices channel had a stale/revoked per-channel token.
-- whatsapp-send and retry-worker now prefer the project-level WHATSAPP_ACCESS_TOKEN.
UPDATE public.whatsapp_channels
SET access_token = NULL,
    updated_at = now()
WHERE display_phone_number = '+44 7521 527543'
  AND phone_number_id = '935831739613016';

-- central_inventory is a view, so it cannot have a real FK to products.
-- Define explicit PostgREST computed relationships for both embedding directions.
CREATE OR REPLACE FUNCTION public.products(p public.central_inventory)
RETURNS SETOF public.products
ROWS 1
STABLE
LANGUAGE sql
AS $$
  SELECT p2.* FROM public.products p2 WHERE p2.id = p.product_id;
$$;

CREATE OR REPLACE FUNCTION public.central_inventory(p public.products)
RETURNS SETOF public.central_inventory
ROWS 1
STABLE
LANGUAGE sql
AS $$
  SELECT ci.* FROM public.central_inventory ci WHERE ci.product_id = p.id;
$$;

GRANT EXECUTE ON FUNCTION public.products(public.central_inventory) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.central_inventory(public.products) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
