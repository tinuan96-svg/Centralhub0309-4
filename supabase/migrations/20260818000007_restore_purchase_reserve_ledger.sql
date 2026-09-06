-- ============================================================
-- RESTORE PURCHASE RESERVE SYSTEM
-- Purpose: Re-create the missing ledger table and automation triggers.
-- ============================================================

-- 1. Create Purchase Reserve Ledger Table
CREATE TABLE IF NOT EXISTS public.purchase_reserve_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL, -- Direct store reference for better filtering
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    quantity integer DEFAULT 0,
    purchase_cost numeric(12,2) DEFAULT 0,
    purchase_reserve numeric(12,2) DEFAULT 0,
    development_reserve numeric(12,2) DEFAULT 0,
    total_reserve numeric(12,2) DEFAULT 0,
    transaction_type text NOT NULL CHECK (transaction_type IN ('reserve_created', 'reserve_reversed', 'committed_to_po', 'used_for_po', 'adjustment')),
    reference text,
    po_id uuid, -- Reference to po_drafts or purchase_orders if needed
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_ledger_store_id ON public.purchase_reserve_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_pr_ledger_order_id ON public.purchase_reserve_ledger(order_id);

-- 2. Add columns to PO Drafts
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_drafts' AND column_name = 'reserve_amount_committed') THEN
        ALTER TABLE public.po_drafts ADD COLUMN reserve_amount_committed numeric(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_drafts' AND column_name = 'reserve_amount_used') THEN
        ALTER TABLE public.po_drafts ADD COLUMN reserve_amount_used numeric(12,2) DEFAULT 0;
    END IF;
END $$;

-- 3. RLS and Grants
ALTER TABLE public.purchase_reserve_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.purchase_reserve_ledger;
CREATE POLICY "Allow all for authenticated" ON public.purchase_reserve_ledger
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.purchase_reserve_ledger;
CREATE POLICY "Allow all for anon" ON public.purchase_reserve_ledger
    FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_reserve_ledger TO authenticated, anon, service_role;

-- 4. Trigger to automatically create reserve when order is paid/confirmed
CREATE OR REPLACE FUNCTION public.fn_on_order_confirmed_create_reserve()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_cost numeric;
    v_pr numeric;
    v_dr numeric;
BEGIN
    -- Trigger when order becomes 'confirmed' OR payment_status becomes 'paid'
    IF (
        (TG_OP = 'UPDATE' AND (
            (NEW.order_status = 'confirmed' AND OLD.order_status IS DISTINCT FROM 'confirmed') OR
            (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
        )) OR
        (TG_OP = 'INSERT' AND (NEW.order_status = 'confirmed' OR NEW.payment_status = 'paid'))
    ) THEN

       -- Avoid double processing
       IF NEW.reserve_created = true THEN
           RETURN NEW;
       END IF;

       -- For each item in the order
       FOR item IN SELECT oi.product_id, oi.quantity, oi.cost_price, p.cost_price as master_cost
                   FROM public.order_items oi
                   LEFT JOIN public.products p ON p.id = oi.product_id
                   WHERE oi.order_id = NEW.id LOOP

           v_cost := COALESCE(item.cost_price, item.master_cost, 0);
           v_pr := item.quantity * v_cost;
           v_dr := v_pr * 0.05; -- 5% development reserve

           IF v_pr > 0 OR v_dr > 0 THEN
               INSERT INTO public.purchase_reserve_ledger (
                   order_id, store_id, product_id, quantity, purchase_cost,
                   purchase_reserve, development_reserve, total_reserve,
                   transaction_type, reference
               ) VALUES (
                   NEW.id, NEW.store_id, item.product_id, item.quantity, v_cost,
                   v_pr, v_dr, (v_pr + v_dr),
                   'reserve_created', 'Auto-generated from Order ' || NEW.order_number
               );
           END IF;
       END LOOP;

       -- Mark as processed
       NEW.reserve_created := true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_order_confirmed_create_reserve ON public.orders;
CREATE TRIGGER trg_on_order_confirmed_create_reserve
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_on_order_confirmed_create_reserve();

-- 5. Aggressive Backfill RPC
CREATE OR REPLACE FUNCTION public.aggressive_backfill_purchase_reserves()
RETURNS jsonb AS $$
DECLARE
    v_order_count integer := 0;
    v_item_count integer := 0;
    v_total_value numeric := 0;
    r_order RECORD;
    r_item RECORD;
    v_cost numeric;
    v_pr numeric;
    v_dr numeric;
BEGIN
    FOR r_order IN SELECT id, order_number, store_id FROM public.orders
                   WHERE (order_status = 'confirmed' OR order_status = 'picking' OR order_status = 'packing' OR order_status = 'packed' OR order_status = 'ready_to_ship' OR order_status = 'shipped' OR order_status = 'delivered' OR order_status = 'completed' OR payment_status = 'paid')
                   AND id NOT IN (SELECT DISTINCT order_id FROM public.purchase_reserve_ledger WHERE transaction_type = 'reserve_created' AND order_id IS NOT NULL) LOOP

        FOR r_item IN SELECT oi.product_id, oi.quantity, oi.cost_price, p.cost_price as master_cost
                     FROM public.order_items oi
                     LEFT JOIN public.products p ON p.id = oi.product_id
                     WHERE oi.order_id = r_order.id LOOP

            v_cost := COALESCE(r_item.cost_price, r_item.master_cost, 0);
            v_pr := r_item.quantity * v_cost;
            v_dr := v_pr * 0.05;

            IF v_pr > 0 OR v_dr > 0 THEN
                INSERT INTO public.purchase_reserve_ledger (
                    order_id, store_id, product_id, quantity, purchase_cost,
                    purchase_reserve, development_reserve, total_reserve,
                    transaction_type, reference
                ) VALUES (
                    r_order.id, r_order.store_id, r_item.product_id, r_item.quantity, v_cost,
                    v_pr, v_dr, (v_pr + v_dr),
                    'reserve_created', 'Aggressive Backfill: Order ' || r_order.order_number
                );
                v_item_count := v_item_count + 1;
                v_total_value := v_total_value + v_pr;
            END IF;
        END LOOP;

        UPDATE public.orders SET reserve_created = true WHERE id = r_order.id;
        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'orders_processed', v_order_count,
        'items_created', v_item_count,
        'total_value_backfilled', v_total_value
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
