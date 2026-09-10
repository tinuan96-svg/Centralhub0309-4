-- MalluSpices shipment audit follow-through
-- 1) Keep historical invoice-backed consignments from replacing the active order tracking identity.
-- 2) Recover three DHL-billed consignments that are absent from shipment history.
-- 3) Keep customer and finance aggregates payment-received-only.
-- 4) Normalize delivered truth for the delivered shipment filter.

BEGIN;

-- Historical DHL bookings are financially real, but must not replace the active tracking/status
-- identity already attached to an order.
CREATE OR REPLACE FUNCTION public.handle_shipment_order_auto_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_current_status text;
  v_target_status text;
  v_current_rank integer := 0;
  v_target_rank integer := 0;
  v_should_advance boolean := false;
BEGIN
  IF NEW.order_id IS NULL THEN RETURN NEW; END IF;

  IF lower(coalesce(NEW.metadata->>'source','')) = 'dhl_invoice_historical_booking' THEN
    RETURN NEW;
  END IF;

  SELECT lower(coalesce(order_status,'')) INTO v_current_status
  FROM public.orders WHERE id=NEW.order_id;

  v_target_status := CASE lower(coalesce(NEW.status,''))
    WHEN 'label_created' THEN 'shipment_booked'
    WHEN 'ready_to_ship' THEN 'ready_to_ship'
    WHEN 'collected' THEN 'shipped'
    WHEN 'in_transit' THEN 'shipped'
    WHEN 'at_local_depot' THEN 'shipped'
    WHEN 'ready_for_collection' THEN 'shipped'
    WHEN 'delivery_attempted' THEN 'shipped'
    WHEN 'delivery_rescheduled' THEN 'shipped'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'returned' THEN 'returned'
    WHEN 'failed' THEN 'failed'
    ELSE NULL
  END;

  v_current_rank := CASE v_current_status
    WHEN 'pending_payment' THEN 0
    WHEN 'paid' THEN 1
    WHEN 'confirmed' THEN 2
    WHEN 'picking' THEN 3
    WHEN 'picked' THEN 4
    WHEN 'packing' THEN 5
    WHEN 'packed' THEN 6
    WHEN 'ready_to_ship' THEN 7
    WHEN 'shipment_booked' THEN 8
    WHEN 'collected' THEN 9
    WHEN 'shipped' THEN 10
    WHEN 'at_local_depot' THEN 11
    WHEN 'out_for_delivery' THEN 12
    WHEN 'delivered' THEN 13
    WHEN 'completed' THEN 14
    ELSE 0
  END;

  v_target_rank := CASE v_target_status
    WHEN 'ready_to_ship' THEN 7
    WHEN 'shipment_booked' THEN 8
    WHEN 'shipped' THEN 10
    WHEN 'out_for_delivery' THEN 12
    WHEN 'delivered' THEN 13
    ELSE 0
  END;

  IF v_target_status IN ('returned','failed') THEN
    v_should_advance := v_current_status NOT IN ('cancelled','refunded');
  ELSIF v_target_status IS NOT NULL THEN
    v_should_advance := v_current_status NOT IN ('cancelled','refunded','returned','failed','completed')
      AND v_target_rank >= v_current_rank;
  END IF;

  UPDATE public.orders
  SET tracking_number=coalesce(NEW.tracking_number,tracking_number),
      tracking_url=coalesce(NEW.tracking_url,tracking_url),
      shipment_label_url=coalesce(NEW.label_url,shipment_label_url),
      shipment_booked_at=coalesce(NEW.booked_at,shipment_booked_at),
      courier_name=CASE WHEN lower(coalesce(NEW.carrier,''))='dhl' THEN 'DHL eCommerce UK' ELSE coalesce(courier_name,NEW.carrier) END,
      carrier=coalesce(NEW.carrier,carrier),
      service_type=coalesce(NEW.service_type,service_type),
      shipment_number=coalesce(NEW.shipment_number,shipment_number),
      label_printed=coalesce(NEW.label_printed,label_printed),
      shipment_status=coalesce(NEW.status,shipment_status),
      last_tracking_status=coalesce(NEW.status,last_tracking_status),
      estimated_delivery=coalesce(NEW.estimated_delivery,estimated_delivery),
      actual_delivery=coalesce(NEW.actual_delivery,actual_delivery),
      delivered_at=CASE WHEN lower(coalesce(NEW.status,''))='delivered' THEN coalesce(NEW.actual_delivery,delivered_at,now()) ELSE delivered_at END,
      order_status=CASE WHEN v_should_advance THEN v_target_status ELSE order_status END,
      fulfillment_status=CASE WHEN v_should_advance THEN v_target_status ELSE fulfillment_status END,
      updated_at=now()
  WHERE id=NEW.order_id;

  RETURN NEW;
END;
$function$;

-- Customer summary must represent orders whose payment was received and that remain business-valid.
CREATE OR REPLACE FUNCTION public.refresh_customer_paid_metrics(
  p_store_id uuid,
  p_email text,
  p_phone text
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email,'')));
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
BEGIN
  UPDATE public.customers c
  SET order_count=x.paid_count,
      total_spend=x.paid_spend,
      last_order_date=x.last_paid_order,
      updated_at=now()
  FROM LATERAL (
    SELECT count(o.id)::int AS paid_count,
           coalesce(sum(o.total),0)::numeric(15,2) AS paid_spend,
           max(o.created_at) AS last_paid_order
    FROM public.orders o
    WHERE o.store_id IS NOT DISTINCT FROM p_store_id
      AND coalesce(o.is_deleted,false)=false
      AND lower(coalesce(o.payment_status,''))='paid'
      AND lower(coalesce(o.order_status,o.status::text,'')) NOT IN ('cancelled','refunded','failed')
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
$function$;

DROP TRIGGER IF EXISTS trg_sync_customer_paid_metrics_from_order ON public.orders;
CREATE TRIGGER trg_sync_customer_paid_metrics_from_order
AFTER INSERT OR DELETE OR UPDATE OF payment_status,order_status,status,total,is_deleted,customer_email,customer_phone,store_id,created_at
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_paid_metrics_from_order();

-- Repair the remaining finance view that still included non-payment-received orders.
CREATE OR REPLACE VIEW public.v_financial_customer_profitability AS
SELECT
  COALESCE(o.user_id::text,NULLIF(o.customer_email::text,''),NULLIF(o.customer_phone::text,''),'guest:'||o.id::text) AS customer_key,
  max(o.customer_name::text) AS customer_name,
  max(o.customer_email::text) AS customer_email,
  max(o.customer_phone::text) AS customer_phone,
  count(*) AS order_count,
  coalesce(sum(coalesce(nullif(o.total_amount,0),o.total_revenue,o.total,0)),0) AS revenue,
  coalesce(sum(coalesce(nullif(o.product_cost_net,0),o.order_cost,0)),0) AS cogs,
  coalesce(sum(coalesce(o.total_cost_net,0)),0) AS total_cost,
  coalesce(sum(coalesce(o.order_profit,0)),0) AS profit,
  CASE
    WHEN coalesce(sum(coalesce(nullif(o.total_amount,0),o.total_revenue,o.total,0)),0)<>0
      THEN round(sum(coalesce(o.order_profit,0))/sum(coalesce(nullif(o.total_amount,0),o.total_revenue,o.total,0))*100,2)
    ELSE 0
  END AS margin_pct
FROM public.orders o
WHERE coalesce(o.is_deleted,false)=false
  AND lower(coalesce(o.payment_status,''))='paid'
  AND lower(coalesce(o.order_status,o.status::text,'')) NOT IN ('cancelled','refunded','failed')
GROUP BY COALESCE(o.user_id::text,NULLIF(o.customer_email::text,''),NULLIF(o.customer_phone::text,''),'guest:'||o.id::text);

ALTER VIEW public.v_financial_customer_profitability SET (security_invoker=true);
GRANT SELECT ON public.v_financial_customer_profitability TO authenticated;

-- Normalize delivered truth so both the dedicated Delivered route and status counters agree.
WITH delivered_orders AS (
  SELECT DISTINCT o.id
  FROM public.orders o
  LEFT JOIN public.shipments s ON s.order_id=o.id
  WHERE coalesce(o.is_deleted,false)=false
    AND lower(coalesce(o.payment_status,''))='paid'
    AND lower(coalesce(o.order_status,o.status::text,'')) NOT IN ('cancelled','refunded','failed')
    AND (
      lower(coalesce(o.order_status,'')) IN ('delivered','completed')
      OR lower(coalesce(o.fulfillment_status,'')) IN ('delivered','completed')
      OR lower(coalesce(o.shipment_status,''))='delivered'
      OR lower(coalesce(s.status,''))='delivered'
    )
)
UPDATE public.orders o
SET order_status=CASE WHEN lower(coalesce(o.order_status,''))='completed' THEN o.order_status ELSE 'delivered' END,
    fulfillment_status=CASE WHEN lower(coalesce(o.order_status,''))='completed' THEN 'completed' ELSE 'delivered' END,
    shipment_status='delivered',
    last_tracking_status='delivered',
    updated_at=now()
FROM delivered_orders d
WHERE o.id=d.id
  AND (
    lower(coalesce(o.order_status,'')) NOT IN ('delivered','completed')
    OR lower(coalesce(o.fulfillment_status,'')) NOT IN ('delivered','completed')
    OR lower(coalesce(o.shipment_status,''))<>'delivered'
    OR o.shipment_status IS NULL
  );

-- Recover only the three invoice rows verified in DHL-issued CSVs and already present in the
-- invoice import ledger. They are separate billed consignments, not replacements for the active one.
WITH verified_consignment(consignment_number) AS (
  VALUES ('60120252069888'::text),('60120252069924'::text),('60120254676295'::text)
), sender AS (
  SELECT company_name,name,contact_name,address_line1,city,postcode,phone
  FROM public.sender_profiles
  WHERE is_default=true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
)
INSERT INTO public.shipments (
  order_id,order_number,carrier,service_type,tracking_number,carrier_reference,shipment_number,status,
  shipping_cost,estimated_shipping_cost,actual_shipping_cost_net,actual_shipping_vat,actual_shipping_cost_gross,
  shipping_cost_source,shipping_cost_reconciled_at,dhl_invoice_number,dhl_invoice_tax_point,dhl_invoice_imported_at,
  shipping_cost_match_method,shipping_cost_match_confidence,weight_grams,
  sender_name,sender_address,sender_city,sender_postcode,sender_phone,
  recipient_name,recipient_address,recipient_city,recipient_postcode,recipient_phone,recipient_email,
  booked_at,metadata,created_at,updated_at
)
SELECT
  o.id,o.order_number,'dhl','standard',c.consignment_number,c.consignment_number,
  'DHL-INV-'||coalesce(c.invoice_number,'RECOVERED')||'-'||right(c.consignment_number,8),'label_created',
  c.net_cost_pence,NULL,c.net_cost_pence,c.vat_pence,c.gross_cost_pence,
  'dhl_invoice',now(),c.invoice_number,c.tax_point,now(),
  'consignment+order_reference+postcode+historical_verified',1.0000,
  greatest(100,round(coalesce(c.weight_kg,0.5)*1000)::int),
  coalesce(sender.company_name,sender.name,'Prime Grocers Ltd'),coalesce(sender.address_line1,''),coalesce(sender.city,''),coalesce(sender.postcode,''),coalesce(sender.phone,''),
  coalesce(nullif(o.customer_name,''),'Customer'),coalesce(c.recipient_address,o.delivery_address,o.shipping_address_line1,''),coalesce(o.delivery_city,o.shipping_city,''),c.recipient_postcode,coalesce(o.customer_phone,''),o.customer_email,
  (c.job_date::timestamp + time '12:00') AT TIME ZONE 'UTC',
  jsonb_build_object(
    'source','dhl_invoice_historical_booking',
    'recovered_from_invoice',true,
    'gmail_invoice_verified',true,
    'invoice_number',c.invoice_number,
    'order_reference',c.order_reference,
    'consignment_number',c.consignment_number,
    'recovered_at',now(),
    'note','Separate DHL-billed historical consignment; does not replace active order tracking identity.'
  ),
  (c.job_date::timestamp + time '12:00') AT TIME ZONE 'UTC',now()
FROM public.dhl_invoice_charges c
JOIN verified_consignment v ON v.consignment_number=c.consignment_number
JOIN public.orders o ON upper(trim(o.order_number))=upper(trim(c.order_reference))
CROSS JOIN sender
WHERE o.store_id='00000000-0000-0000-0000-000000000001'::uuid
  AND coalesce(o.is_deleted,false)=false
  AND lower(coalesce(o.payment_status,''))='paid'
  AND regexp_replace(upper(coalesce(o.shipping_postcode,o.delivery_postcode,'')),'[^A-Z0-9]','','g')
      = regexp_replace(upper(coalesce(c.recipient_postcode,'')),'[^A-Z0-9]','','g')
  AND NOT EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.tracking_number=c.consignment_number OR s.carrier_reference=c.consignment_number
  );

-- Attach the already-imported DHL charge rows to their newly recovered exact consignments.
UPDATE public.dhl_invoice_charges c
SET matched_shipment_id=s.id,
    matched_order_id=s.order_id,
    match_status='matched',
    match_method='consignment+order_reference+postcode+historical_verified',
    match_confidence=1.0000,
    match_notes='Verified DHL invoice consignment retained as a separate historical shipment; exact order reference and postcode matched.',
    updated_at=now()
FROM public.shipments s
WHERE c.consignment_number IN ('60120252069888','60120252069924','60120254676295')
  AND c.consignment_number=s.tracking_number
  AND c.order_reference=s.order_number
  AND s.metadata->>'source'='dhl_invoice_historical_booking';

-- Final customer backfill using the corrected rule.
WITH agg AS (
  SELECT
    c.id AS customer_id,
    count(o.id)::int AS paid_count,
    coalesce(sum(o.total),0)::numeric(15,2) AS paid_spend,
    max(o.created_at) AS last_paid
  FROM public.customers c
  LEFT JOIN public.orders o
    ON o.store_id IS NOT DISTINCT FROM c.store_id
   AND coalesce(o.is_deleted,false)=false
   AND lower(coalesce(o.payment_status,''))='paid'
   AND lower(coalesce(o.order_status,o.status::text,'')) NOT IN ('cancelled','refunded','failed')
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

NOTIFY pgrst,'reload schema';

COMMIT;
