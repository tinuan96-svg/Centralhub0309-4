-- CentralHub integrity hardening: payment-received-only business metrics and exact DHL consignment accounting.

-- 1) Finance reporting: only payment-received orders are revenue/profit-bearing.
CREATE OR REPLACE VIEW public.v_finance_pnl_by_product AS
SELECT
  oi.product_id,
  oi.product_name,
  SUM(COALESCE(oi.quantity,0)) units_sold,
  SUM(COALESCE(oi.total_price,COALESCE(oi.quantity,0)*COALESCE(oi.unit_price,0),0)) revenue,
  SUM(COALESCE(oi.quantity,0)*COALESCE(oi.cost_price,0)) cogs,
  SUM(COALESCE(oi.total_price,COALESCE(oi.quantity,0)*COALESCE(oi.unit_price,0),0)-COALESCE(oi.quantity,0)*COALESCE(oi.cost_price,0)) gross_profit
FROM public.order_items oi
JOIN public.orders o ON o.id=oi.order_id
WHERE COALESCE(o.is_deleted,false)=false
  AND COALESCE(o.payment_status,'')='paid'
  AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed')
GROUP BY oi.product_id,oi.product_name;
GRANT SELECT ON public.v_finance_pnl_by_product TO authenticated;

CREATE OR REPLACE VIEW public.v_finance_pnl_by_customer AS
SELECT
  o.user_id,
  o.customer_email,
  o.customer_name,
  COUNT(*) orders,
  SUM(COALESCE(NULLIF(o.total_amount,0),NULLIF(o.total_revenue,0),NULLIF(o.total,0),COALESCE(o.subtotal,0)+COALESCE(o.delivery_fee,0))) revenue,
  SUM(COALESCE(o.product_cost_net,o.order_cost,0)) cogs,
  SUM(COALESCE(o.packing_cost_net,o.packing_cost,0)+COALESCE(o.shipping_cost_net,o.shipping_cost,0)+COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)) variable_costs,
  SUM(COALESCE(o.order_profit,0)) contribution_profit
FROM public.orders o
WHERE COALESCE(o.is_deleted,false)=false
  AND COALESCE(o.payment_status,'')='paid'
  AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed')
GROUP BY o.user_id,o.customer_email,o.customer_name;
GRANT SELECT ON public.v_finance_pnl_by_customer TO authenticated;

-- 2) Stored customer aggregates: keep them aligned to payment-received orders automatically.
CREATE OR REPLACE FUNCTION public.refresh_customer_paid_metrics(
  p_store_id uuid,
  p_email text,
  p_phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email,'')));
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
BEGIN
  UPDATE public.customers c
  SET
    order_count = x.paid_count,
    total_spend = x.paid_spend,
    last_order_date = x.last_paid_order,
    updated_at = now()
  FROM LATERAL (
    SELECT
      count(o.id)::int AS paid_count,
      coalesce(sum(o.total),0)::numeric(15,2) AS paid_spend,
      max(o.created_at) AS last_paid_order
    FROM public.orders o
    WHERE o.store_id IS NOT DISTINCT FROM p_store_id
      AND coalesce(o.is_deleted,false)=false
      AND o.payment_status='paid'
      AND (
        (v_email<>'' AND lower(trim(coalesce(o.customer_email,'')))=v_email)
        OR
        (v_email='' AND v_phone<>'' AND regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g')=v_phone)
      )
  ) x
  WHERE c.store_id IS NOT DISTINCT FROM p_store_id
    AND (
      (v_email<>'' AND lower(trim(coalesce(c.email,'')))=v_email)
      OR
      (v_email='' AND v_phone<>'' AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_paid_metrics_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.refresh_customer_paid_metrics(OLD.store_id,OLD.customer_email,OLD.customer_phone);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.refresh_customer_paid_metrics(NEW.store_id,NEW.customer_email,NEW.customer_phone);
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_paid_metrics_from_order ON public.orders;
CREATE TRIGGER trg_sync_customer_paid_metrics_from_order
AFTER INSERT OR DELETE OR UPDATE OF payment_status,total,is_deleted,customer_email,customer_phone,store_id,created_at
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_paid_metrics_from_order();

-- Backfill every current customer once using the same paid-only identity rule.
WITH agg AS (
  SELECT
    c.id customer_id,
    count(o.id)::int paid_count,
    coalesce(sum(o.total),0)::numeric(15,2) paid_spend,
    max(o.created_at) last_paid
  FROM public.customers c
  LEFT JOIN public.orders o
    ON o.store_id IS NOT DISTINCT FROM c.store_id
   AND coalesce(o.is_deleted,false)=false
   AND o.payment_status='paid'
   AND (
      (nullif(trim(c.email),'') IS NOT NULL AND lower(trim(coalesce(o.customer_email,'')))=lower(trim(c.email)))
      OR
      (nullif(trim(c.email),'') IS NULL
       AND nullif(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),'') IS NOT NULL
       AND regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g')=regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'))
   )
  GROUP BY c.id
)
UPDATE public.customers c
SET order_count=a.paid_count,
    total_spend=a.paid_spend,
    last_order_date=a.last_paid,
    updated_at=now()
FROM agg a
WHERE a.customer_id=c.id;

-- 3) DHL financial identity guard. A charge can only auto-match the exact shipment consignment.
CREATE OR REPLACE FUNCTION public.guard_dhl_invoice_charge_consignment_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
DECLARE
  v_tracking text;
  v_carrier_reference text;
BEGIN
  IF NEW.match_status='matched' AND NEW.matched_shipment_id IS NOT NULL THEN
    SELECT tracking_number,carrier_reference
      INTO v_tracking,v_carrier_reference
    FROM public.shipments
    WHERE id=NEW.matched_shipment_id;

    IF coalesce(NEW.consignment_number,'')=''
       OR (
         coalesce(NEW.consignment_number,'')<>coalesce(v_tracking,'')
         AND coalesce(NEW.consignment_number,'')<>coalesce(v_carrier_reference,'')
       ) THEN
      NEW.match_status := 'needs_review';
      NEW.match_method := 'consignment_mismatch_blocked';
      NEW.match_confidence := 0;
      NEW.match_notes := 'Database guard blocked auto-match because DHL consignment differs from shipment tracking/carrier reference.';
      NEW.matched_shipment_id := NULL;
      NEW.matched_order_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_dhl_invoice_charge_consignment_match ON public.dhl_invoice_charges;
CREATE TRIGGER trg_guard_dhl_invoice_charge_consignment_match
BEFORE INSERT OR UPDATE OF match_status,matched_shipment_id,matched_order_id,consignment_number
ON public.dhl_invoice_charges
FOR EACH ROW EXECUTE FUNCTION public.guard_dhl_invoice_charge_consignment_match();

-- Detach any legacy false match that predates the guard.
UPDATE public.dhl_invoice_charges c
SET matched_shipment_id=NULL,
    matched_order_id=NULL,
    match_status='needs_review',
    match_method='consignment_mismatch_blocked',
    match_confidence=0,
    match_notes='Detached by exact-consignment integrity migration.',
    updated_at=now()
FROM public.shipments s
WHERE s.id=c.matched_shipment_id
  AND c.match_status='matched'
  AND coalesce(c.consignment_number,'')<>coalesce(s.tracking_number,'')
  AND coalesce(c.consignment_number,'')<>coalesce(s.carrier_reference,'');

NOTIFY pgrst,'reload schema';
