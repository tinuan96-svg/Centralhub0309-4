-- Retire the active MalluSpices Mollie gateway configuration.
-- Historical orders and Mollie audit tables are intentionally preserved for accounting/audit continuity.

DO $$
DECLARE
  v_store_id text;
BEGIN
  SELECT id::text
  INTO v_store_id
  FROM public.stores
  WHERE lower(slug) = 'malluspices'
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.gateway_fee_rules
  WHERE gateway_id IN (
    SELECT id
    FROM public.payment_gateways
    WHERE store_id = v_store_id
      AND lower(gateway_name) = 'mollie'
  );

  DELETE FROM public.payment_gateways
  WHERE store_id = v_store_id
    AND lower(gateway_name) = 'mollie';
END $$;
