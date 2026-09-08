-- Fix purchase-order generation for generated line totals and the source_reason check.
-- purchase_order_items.total is GENERATED ALWAYS AS (quantity_ordered * unit_cost).
-- FAST_MOVING is an allowed source_reason for sales-flow replenishment.

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_items(
  p_supplier_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_source_type text DEFAULT 'replenishment'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_po uuid;
  v_num text;
  x jsonb;
  pid uuid;
  qty int;
  offer record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  IF p_supplier_id IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Supplier and items are required';
  END IF;

  v_num := 'PO-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' ||
           upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.purchase_orders
    (po_number,supplier_id,status,order_date,total_cost,currency,notes,created_by,source_type)
  VALUES
    (v_num,p_supplier_id,'draft',CURRENT_DATE,0,'GBP',p_notes,auth.uid(),COALESCE(p_source_type,'manual'))
  RETURNING id INTO v_po;

  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    pid := (x->>'product_id')::uuid;
    qty := GREATEST(COALESCE((x->>'quantity')::int,0),0);

    IF qty > 0 THEN
      SELECT * INTO offer
      FROM public.get_supplier_offers_for_product(pid)
      WHERE supplier_id = p_supplier_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No valid offer for product % from supplier %',pid,p_supplier_id;
      END IF;

      INSERT INTO public.purchase_order_items
        (purchase_order_id,product_id,supplier_product_name,supplier_sku,
         quantity_ordered,quantity_received,unit_cost,source_reason,
         forecast_quantity,gtin,supplier_product_id,pack_size,case_quantity,
         unit_cost_ex_vat,supplier_offer_source,expected_quantity)
      VALUES
        (v_po,pid,offer.supplier_product_name,offer.supplier_sku,
         qty,0,offer.unit_cost,'FAST_MOVING',
         qty,offer.supplier_barcode,offer.supplier_product_id,offer.pack_size,
         offer.case_quantity,offer.unit_cost,offer.source,qty);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=v_po
  ) THEN
    DELETE FROM public.purchase_orders WHERE id=v_po;
    RAISE EXCEPTION 'No valid purchase items supplied';
  END IF;

  UPDATE public.purchase_orders
  SET total_cost = (
        SELECT COALESCE(sum(total),0)
        FROM public.purchase_order_items
        WHERE purchase_order_id=v_po
      ),
      supplier_selection_reason =
        'Supplier selected from current valid offer using normalized unit cost, MOQ/case constraints and lead time.',
      source_type = COALESCE(p_source_type,'manual')
  WHERE id=v_po;

  RETURN v_po;
END;
$fn$;
