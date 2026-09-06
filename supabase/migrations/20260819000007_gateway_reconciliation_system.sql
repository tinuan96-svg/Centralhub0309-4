-- Payment Gateway and Bank Reconciliation System

-- 1. Add gateway tracking to orders
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'gateway_name') THEN
        ALTER TABLE public.orders ADD COLUMN gateway_name text;
    END IF;

    -- Ensure gateway_fee_net exists (it should, but just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'gateway_fee_net') THEN
        ALTER TABLE public.orders ADD COLUMN gateway_fee_net numeric(10,2) DEFAULT 0;
    END IF;
END $$;

-- 2. Create payout_reconciliation table to handle batch payouts (one bank tx -> many orders)
CREATE TABLE IF NOT EXISTS public.payout_reconciliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    amount_allocated numeric(10,2) NOT NULL,
    fee_allocated numeric(10,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(bank_transaction_id, order_id)
);

-- 3. Enable RLS
ALTER TABLE public.payout_reconciliations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Allow all on payout_reconciliations" ON public.payout_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payout_rec_order ON public.payout_reconciliations(order_id);
CREATE INDEX IF NOT EXISTS idx_payout_rec_tx ON public.payout_reconciliations(bank_transaction_id);

-- 6. Update bank_transactions to support merchant-based auto-categorization
CREATE OR REPLACE FUNCTION public.trg_auto_categorize_bank_transaction()
RETURNS trigger AS $$
BEGIN
    -- Detect Mollie Payouts
    IF NEW.description ILIKE '%MOLLIE%' OR NEW.description ILIKE '%Stg Mollie%' THEN
        NEW.category := 'Gateway Payout';
        NEW.merchant := 'Mollie';
    -- Detect Trust Payments
    ELSIF NEW.description ILIKE '%TRUST PAYMENTS%' OR NEW.description ILIKE '%TRST PAY%' THEN
        NEW.category := 'Gateway Payout';
        NEW.merchant := 'Trust Payments';
    -- Detect Shipping Costs
    ELSIF NEW.description ILIKE '%DHL%' OR NEW.description ILIKE '%DPD%' THEN
        NEW.category := 'Shipping';
        NEW.merchant := 'Courier';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_categorize_bank_tx ON public.bank_transactions;
CREATE TRIGGER trg_auto_categorize_bank_tx
    BEFORE INSERT OR UPDATE OF description ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_auto_categorize_bank_transaction();
