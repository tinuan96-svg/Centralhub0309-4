-- Finance payable alerts: persistent reminders for supplier invoices without creating a second payable source.
CREATE TABLE IF NOT EXISTS public.finance_payable_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('overdue','due_soon','due_this_week','large_balance')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','snoozed','resolved')),
  due_date date,
  amount_due numeric(15,2) NOT NULL DEFAULT 0,
  message text NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  snoozed_until timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_invoice_id,alert_type)
);

ALTER TABLE public.finance_payable_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage finance payable alerts" ON public.finance_payable_alerts;
CREATE POLICY "Authenticated users can manage finance payable alerts"
  ON public.finance_payable_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_finance_payable_alerts_status_due ON public.finance_payable_alerts(status,due_date);
CREATE INDEX IF NOT EXISTS idx_finance_payable_alerts_invoice ON public.finance_payable_alerts(supplier_invoice_id);

CREATE OR REPLACE FUNCTION public.refresh_finance_payable_alerts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer := 0; r record; v_type text; v_severity text; v_message text;
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised to refresh finance alerts'; END IF;
  FOR r IN SELECT * FROM public.supplier_payables_overview WHERE amount_due > 0.01 AND payment_alert IN ('overdue','due_soon','due_this_week') LOOP
    v_type := r.payment_alert;
    v_severity := CASE WHEN r.payment_alert='overdue' THEN 'critical' WHEN r.payment_alert='due_soon' THEN 'warning' ELSE 'info' END;
    v_message := CASE WHEN r.payment_alert='overdue'
      THEN format('Supplier invoice %s is overdue by %s day(s). £%s remains outstanding.',r.invoice_number,ABS(r.days_to_due),to_char(r.amount_due,'FM999999990.00'))
      ELSE format('Supplier invoice %s is due in %s day(s). £%s remains outstanding.',r.invoice_number,r.days_to_due,to_char(r.amount_due,'FM999999990.00')) END;
    INSERT INTO public.finance_payable_alerts(supplier_invoice_id,alert_type,severity,status,due_date,amount_due,message,updated_at)
    VALUES(r.supplier_invoice_id,v_type,v_severity,'open',r.due_date,r.amount_due,v_message,now())
    ON CONFLICT (supplier_invoice_id,alert_type) DO UPDATE SET
      severity=EXCLUDED.severity,due_date=EXCLUDED.due_date,amount_due=EXCLUDED.amount_due,message=EXCLUDED.message,
      status=CASE WHEN public.finance_payable_alerts.status='resolved' AND r.amount_due>0.01 THEN 'open' ELSE public.finance_payable_alerts.status END,
      updated_at=now();
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.finance_payable_alerts a SET status='resolved',resolved_at=COALESCE(resolved_at,now()),updated_at=now()
  WHERE status <> 'resolved' AND NOT EXISTS (SELECT 1 FROM public.supplier_payables_overview p WHERE p.supplier_invoice_id=a.supplier_invoice_id AND p.amount_due>0.01 AND p.payment_alert=a.alert_type);
  RETURN v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_finance_payable_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_finance_payable_alert_status(
  p_alert_id uuid,
  p_status text,
  p_snoozed_until timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised to manage finance alerts'; END IF;
  IF p_status NOT IN ('open','acknowledged','snoozed','resolved') THEN RAISE EXCEPTION 'Invalid alert status'; END IF;
  UPDATE public.finance_payable_alerts SET status=p_status,snoozed_until=CASE WHEN p_status='snoozed' THEN p_snoozed_until ELSE NULL END,
    acknowledged_at=CASE WHEN p_status='acknowledged' THEN now() ELSE acknowledged_at END,
    acknowledged_by=CASE WHEN p_status='acknowledged' THEN auth.uid() ELSE acknowledged_by END,
    resolved_at=CASE WHEN p_status='resolved' THEN now() ELSE NULL END,updated_at=now() WHERE id=p_alert_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Finance alert not found'; END IF;
  RETURN jsonb_build_object('success',true,'alert_id',p_alert_id,'status',p_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_finance_payable_alert_status(uuid,text,timestamptz) TO authenticated;

NOTIFY pgrst,'reload schema';
