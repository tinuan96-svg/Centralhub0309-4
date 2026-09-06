-- Finance Stage 4: supplier payable/payment reconciliation.
-- Reuses bank_transactions, supplier_invoices and suppliers as the authoritative records.

CREATE TABLE IF NOT EXISTS public.bank_supplier_invoice_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  supplier_invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  matched_amount numeric NOT NULL CHECK (matched_amount > 0),
  match_status text NOT NULL DEFAULT 'confirmed' CHECK (match_status IN ('suggested','confirmed','rejected')),
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  matched_by uuid,
  matched_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bank_transaction_id,supplier_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_supplier_matches_tx ON public.bank_supplier_invoice_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_supplier_matches_invoice ON public.bank_supplier_invoice_matches(supplier_invoice_id);
ALTER TABLE public.bank_supplier_invoice_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_supplier_invoice_matches_admin_all ON public.bank_supplier_invoice_matches;
CREATE POLICY bank_supplier_invoice_matches_admin_all ON public.bank_supplier_invoice_matches FOR ALL TO authenticated USING (public.finance_can_manage()) WITH CHECK (public.finance_can_manage());

CREATE OR REPLACE FUNCTION public.set_supplier_invoice_due_date()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_credit integer;
BEGIN
  IF NEW.due_date IS NULL AND NEW.invoice_date IS NOT NULL THEN
    v_credit := COALESCE(NEW.credit_period_days,(SELECT s.credit_period_days FROM public.suppliers s WHERE s.id=NEW.supplier_id),0);
    NEW.due_date := NEW.invoice_date + GREATEST(v_credit,0);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_supplier_invoice_due_date ON public.supplier_invoices;
CREATE TRIGGER trg_supplier_invoice_due_date BEFORE INSERT OR UPDATE OF invoice_date,credit_period_days,supplier_id ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.set_supplier_invoice_due_date();
UPDATE public.supplier_invoices si SET due_date=si.invoice_date+GREATEST(COALESCE(si.credit_period_days,s.credit_period_days,0),0) FROM public.suppliers s WHERE si.supplier_id=s.id AND si.due_date IS NULL AND si.invoice_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_supplier_invoice_payment_suggestions(p_transaction_id uuid)
RETURNS TABLE(supplier_invoice_id uuid,supplier_name text,invoice_number text,invoice_date date,due_date date,total_amount numeric,amount_paid numeric,amount_due numeric,suggested_amount numeric,confidence numeric,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH t AS (SELECT * FROM public.bank_transactions WHERE id=p_transaction_id AND type='debit'), c AS (
SELECT si.id supplier_invoice_id,s.name supplier_name,si.invoice_number,si.invoice_date,si.due_date,si.total_amount,COALESCE(si.amount_paid,0) amount_paid,GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0) amount_due,t.amount tx_amount,
CASE WHEN abs(GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0)-abs(t.amount))<=0.01 THEN 1.0 WHEN lower(COALESCE(t.reference,'')) LIKE '%'||lower(COALESCE(si.invoice_number,''))||'%' THEN 0.95 WHEN lower(COALESCE(t.merchant,'')) LIKE '%'||lower(COALESCE(s.name,''))||'%' THEN 0.85 WHEN lower(COALESCE(t.description,'')) LIKE '%'||lower(COALESCE(s.name,''))||'%' THEN 0.80 ELSE 0.30 END confidence,
CASE WHEN abs(GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0)-abs(t.amount))<=0.01 THEN 'Exact outstanding amount' WHEN lower(COALESCE(t.reference,'')) LIKE '%'||lower(COALESCE(si.invoice_number,''))||'%' THEN 'Invoice number found in bank reference' WHEN lower(COALESCE(t.merchant,'')) LIKE '%'||lower(COALESCE(s.name,''))||'%' THEN 'Supplier name found in merchant' WHEN lower(COALESCE(t.description,'')) LIKE '%'||lower(COALESCE(s.name,''))||'%' THEN 'Supplier name found in description' ELSE 'Possible unpaid supplier invoice' END reason
FROM t JOIN public.supplier_invoices si ON GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0)>0.01 JOIN public.suppliers s ON s.id=si.supplier_id WHERE COALESCE(si.payment_status,'') NOT IN ('paid','cancelled'))
SELECT supplier_invoice_id,supplier_name,invoice_number,invoice_date,due_date,total_amount,amount_paid,amount_due,LEAST(amount_due,abs(tx_amount)),confidence,reason FROM c WHERE confidence>=0.30 ORDER BY confidence DESC,due_date ASC NULLS LAST LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.get_supplier_invoice_payment_suggestions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_supplier_invoice_payment(p_bank_transaction_id uuid,p_supplier_invoice_id uuid,p_amount numeric DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bt public.bank_transactions%ROWTYPE; si public.supplier_invoices%ROWTYPE; v_amount numeric; v_paid numeric; v_due numeric;
BEGIN
 IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;
 SELECT * INTO bt FROM public.bank_transactions WHERE id=p_bank_transaction_id FOR UPDATE;
 IF NOT FOUND OR bt.type<>'debit' THEN RAISE EXCEPTION 'Supplier invoice payment must use a debit bank transaction'; END IF;
 SELECT * INTO si FROM public.supplier_invoices WHERE id=p_supplier_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier invoice not found'; END IF;
 v_due:=GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0); v_amount:=COALESCE(p_amount,LEAST(v_due,abs(COALESCE(bt.amount,0))));
 IF v_amount<=0 OR v_amount>v_due+0.01 THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
 INSERT INTO public.bank_supplier_invoice_matches(bank_transaction_id,supplier_invoice_id,matched_amount,match_status,matched_by,notes) VALUES(bt.id,si.id,v_amount,'confirmed',auth.uid(),p_notes)
 ON CONFLICT(bank_transaction_id,supplier_invoice_id) DO UPDATE SET matched_amount=EXCLUDED.matched_amount,match_status='confirmed',matched_by=auth.uid(),matched_at=now(),notes=EXCLUDED.notes;
 v_paid:=COALESCE(si.amount_paid,0)+v_amount;
 UPDATE public.supplier_invoices SET amount_paid=v_paid,payment_status=CASE WHEN v_paid>=COALESCE(total_amount,0)-0.01 THEN 'paid' ELSE 'partially_paid' END,paid_at=CASE WHEN v_paid>=COALESCE(total_amount,0)-0.01 THEN COALESCE(paid_at,now()) ELSE NULL END,payment_notes=COALESCE(p_notes,payment_notes),updated_at=now() WHERE id=si.id;
 UPDATE public.bank_transactions SET supplier_invoice_id=si.id,reconciled_with_supplier_invoice_id=si.id,is_reconciled=true,classification_status='classified',transaction_category='supplier_payment',accounting_category='cogs',classified_at=COALESCE(classified_at,now()),updated_at=now(),notes=COALESCE(p_notes,notes) WHERE id=bt.id;
 RETURN jsonb_build_object('bank_transaction_id',bt.id,'supplier_invoice_id',si.id,'matched_amount',v_amount,'amount_paid',v_paid,'amount_due',GREATEST(COALESCE(si.total_amount,0)-v_paid,0),'payment_status',CASE WHEN v_paid>=COALESCE(si.total_amount,0)-0.01 THEN 'paid' ELSE 'partially_paid' END);
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_supplier_invoice_payment(uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE VIEW public.v_supplier_payment_reconciliation AS
SELECT m.id match_id,m.bank_transaction_id,m.supplier_invoice_id,m.matched_amount,m.match_status,m.confidence,m.matched_at,bt.transaction_date,bt.amount bank_amount,bt.merchant,bt.description,bt.reference,si.invoice_number,si.invoice_date,si.due_date,si.total_amount,si.amount_paid,GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0) amount_due,s.id supplier_id,s.name supplier_name
FROM public.bank_supplier_invoice_matches m JOIN public.bank_transactions bt ON bt.id=m.bank_transaction_id JOIN public.supplier_invoices si ON si.id=m.supplier_invoice_id JOIN public.suppliers s ON s.id=si.supplier_id;
GRANT SELECT ON public.v_supplier_payment_reconciliation TO authenticated;
NOTIFY pgrst,'reload schema';
