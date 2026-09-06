BEGIN;
ALTER TABLE public.finance_reserve_settings ADD COLUMN IF NOT EXISTS activation_timestamp timestamptz;
CREATE OR REPLACE FUNCTION public.set_reserve_allocation_settings(p_enabled boolean,p_start_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
 UPDATE public.finance_reserve_settings SET enabled=COALESCE(p_enabled,true),allocation_start_date=p_start_date,activation_timestamp=CASE WHEN COALESCE(p_enabled,true) THEN now() ELSE activation_timestamp END,updated_at=now() WHERE id=true;
END; $$;
CREATE OR REPLACE FUNCTION public.allocate_reserves_for_reconciled_sale(p_bank_transaction_id uuid,p_order_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_amount numeric;v_tx_date date;v_created_at timestamptz;v_purchase numeric:=0;v_growth numeric;v_marketing numeric;v_purchase_id uuid;v_growth_id uuid;v_marketing_id uuid;v_start date;v_activation timestamptz;v_enabled boolean;r record;
BEGIN
 SELECT amount,transaction_date,created_at,COALESCE(reserve_allocation_enabled,true) INTO v_amount,v_tx_date,v_created_at,v_enabled FROM public.bank_transactions WHERE id=p_bank_transaction_id AND (is_reconciled=true OR reconciliation_status='reconciled') AND amount>0;
 IF v_amount IS NULL OR NOT COALESCE(v_enabled,true) THEN RETURN; END IF;
 SELECT enabled,allocation_start_date,activation_timestamp INTO v_enabled,v_start,v_activation FROM public.finance_reserve_settings WHERE id=true;
 IF NOT COALESCE(v_enabled,true) OR (v_start IS NOT NULL AND v_tx_date<v_start) OR (v_activation IS NOT NULL AND v_created_at<v_activation) THEN RETURN; END IF;
 SELECT id INTO v_purchase_id FROM public.finance_reserve_types WHERE name='Purchase Reserve';SELECT id INTO v_growth_id FROM public.finance_reserve_types WHERE name='Growth Reserve';SELECT id INTO v_marketing_id FROM public.finance_reserve_types WHERE name='Marketing Reserve';
 IF NOT EXISTS(SELECT 1 FROM public.finance_reserve_allocations WHERE bank_transaction_id=p_bank_transaction_id AND reserve_type_id=v_purchase_id AND status<>'reversed') THEN
  IF EXISTS(SELECT 1 FROM public.bank_transaction_links WHERE bank_transaction_id=p_bank_transaction_id AND linked_order_id IS NOT NULL) THEN FOR r IN SELECT DISTINCT linked_order_id order_id FROM public.bank_transaction_links WHERE bank_transaction_id=p_bank_transaction_id AND linked_order_id IS NOT NULL LOOP v_purchase:=v_purchase+COALESCE(public.calculate_purchase_reserve_for_order(r.order_id),0);END LOOP;ELSIF p_order_id IS NOT NULL THEN v_purchase:=COALESCE(public.calculate_purchase_reserve_for_order(p_order_id),0);END IF;
  IF v_purchase>0 THEN INSERT INTO public.finance_reserve_allocations(reserve_type_id,bank_transaction_id,order_id,amount,allocation_basis) VALUES(v_purchase_id,p_bank_transaction_id,p_order_id,v_purchase,v_purchase);END IF;
 END IF;
 v_growth:=round(v_amount*0.02,2);v_marketing:=round(v_amount*0.05,2);
 IF NOT EXISTS(SELECT 1 FROM public.finance_reserve_allocations WHERE bank_transaction_id=p_bank_transaction_id AND reserve_type_id=v_growth_id AND status<>'reversed') THEN INSERT INTO public.finance_reserve_allocations(reserve_type_id,bank_transaction_id,order_id,amount,allocation_basis) VALUES(v_growth_id,p_bank_transaction_id,NULL,v_growth,v_amount);END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_reserve_allocations WHERE bank_transaction_id=p_bank_transaction_id AND reserve_type_id=v_marketing_id AND status<>'reversed') THEN INSERT INTO public.finance_reserve_allocations(reserve_type_id,bank_transaction_id,order_id,amount,allocation_basis) VALUES(v_marketing_id,p_bank_transaction_id,NULL,v_marketing,v_amount);END IF;
END; $$;
COMMIT;
