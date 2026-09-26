-- assign_product_barcode mutates canonical product/barcode data and is not used by browser clients.
REVOKE EXECUTE ON FUNCTION public.assign_product_barcode(uuid,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_product_barcode(uuid,text,text) TO service_role;
