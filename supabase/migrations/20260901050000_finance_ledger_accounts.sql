-- Finance Stage 6: explicit chart of accounts / ledger mapping.
-- Assets, liabilities, equity and internal transfers are balance-sheet items and MUST NOT enter P&L.
-- No physical cash is modelled; bank transactions remain the cash movement source.

CREATE TABLE IF NOT EXISTS public.finance_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  ledger_type text NOT NULL CHECK (ledger_type IN ('income','expense','asset','liability','equity','internal')),
  pnl_class text NOT NULL DEFAULT 'none' CHECK (pnl_class IN ('revenue','cogs','variable_expense','operating_expense','finance_cost','tax','other_income','other_expense','none')),
  pricing_relevant boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES public.finance_ledger_accounts(id) ON DELETE SET NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_ledger_pnl_type_check CHECK (
    (ledger_type='income' AND pnl_class IN ('revenue','other_income')) OR
    (ledger_type='expense' AND pnl_class IN ('cogs','variable_expense','operating_expense','finance_cost','tax','other_expense')) OR
    (ledger_type IN ('asset','liability','equity','internal') AND pnl_class='none')
  )
);

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS ledger_account_id uuid REFERENCES public.finance_ledger_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ledger_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS ledger_assigned_by uuid;

CREATE INDEX IF NOT EXISTS idx_finance_ledger_accounts_type ON public.finance_ledger_accounts(ledger_type,is_active);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_ledger_account ON public.bank_transactions(ledger_account_id);

ALTER TABLE public.finance_ledger_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_ledger_accounts_admin_all ON public.finance_ledger_accounts;
CREATE POLICY finance_ledger_accounts_admin_all ON public.finance_ledger_accounts FOR ALL TO authenticated USING (public.finance_can_manage()) WITH CHECK (public.finance_can_manage());

INSERT INTO public.finance_ledger_accounts(code,name,ledger_type,pnl_class,pricing_relevant,description,is_system)
VALUES
('4000','Sales income','income','revenue',false,'Customer sales and order revenue',true),
('4100','Other income','income','other_income',false,'Non-sales business income',true),
('5000','Product COGS','expense','cogs',true,'Cost of products sold',true),
('5100','Variable fulfilment costs','expense','variable_expense',true,'Variable packing, shipping and payment-related costs',true),
('6000','Operating expenses','expense','operating_expense',true,'Normal operating expenses',true),
('6100','Finance costs','expense','finance_cost',false,'Bank, finance and borrowing costs',true),
('6200','Tax expense','expense','tax',false,'Tax and tax-related expense',true),
('6300','Other expenses','expense','other_expense',false,'Other P&L expenses',true),
('1000','Bank / cash accounts','asset','none',false,'Bank balances and other cash-equivalent assets',true),
('1100','Inventory asset','asset','none',false,'Stock held for resale; not an immediate P&L bank expense',true),
('1200','Customer receivables','asset','none',false,'Amounts owed by customers',true),
('1300','Other assets','asset','none',false,'Other business assets',true),
('2000','Supplier payables','liability','none',false,'Amounts owed to suppliers',true),
('2100','Loans / finance liabilities','liability','none',false,'Borrowings and finance liabilities',true),
('2200','Tax liabilities','liability','none',false,'Tax payable balances',true),
('2300','Other liabilities','liability','none',false,'Other business liabilities',true),
('3000','Owner / equity','equity','none',false,'Owner capital and equity movements',true),
('9000','Internal transfers / savings','internal','none',false,'Own-account transfers and earmarked savings; never P&L',true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.bank_transactions bt
SET ledger_account_id = la.id,
    ledger_assigned_at = COALESCE(bt.ledger_assigned_at,now())
FROM public.finance_ledger_accounts la
WHERE bt.ledger_account_id IS NULL
  AND ((bt.accounting_category='revenue' AND la.code='4000')
    OR (bt.accounting_category='cogs' AND la.code='5000')
    OR (bt.accounting_category='operating_expense' AND la.code='6000')
    OR (bt.accounting_category='finance_cost' AND la.code='6100')
    OR (bt.accounting_category='tax' AND la.code='6200')
    OR (bt.accounting_category='transfer' AND la.code='9000'));

CREATE OR REPLACE FUNCTION public.assign_bank_transaction_ledger(p_transaction_id uuid,p_ledger_account_id uuid,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE la public.finance_ledger_accounts%ROWTYPE; bt public.bank_transactions%ROWTYPE;
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO bt FROM public.bank_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF bt.id IS NULL THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;
  SELECT * INTO la FROM public.finance_ledger_accounts WHERE id=p_ledger_account_id AND is_active;
  IF la.id IS NULL THEN RAISE EXCEPTION 'Ledger account not found or inactive'; END IF;
  UPDATE public.bank_transactions SET ledger_account_id=la.id, ledger_assigned_at=now(), ledger_assigned_by=auth.uid(), notes=COALESCE(p_notes,notes), updated_at=now() WHERE id=bt.id;
  RETURN jsonb_build_object('transaction_id',bt.id,'ledger_account_id',la.id,'ledger_type',la.ledger_type,'pnl_class',la.pnl_class,'affects_pnl',la.pnl_class<>'none');
END; $$;
GRANT EXECUTE ON FUNCTION public.assign_bank_transaction_ledger(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_finance_ledger_account(p_code text,p_name text,p_ledger_type text,p_pnl_class text DEFAULT 'none',p_pricing_relevant boolean DEFAULT false,p_description text DEFAULT NULL,p_parent_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_ledger_type IN ('asset','liability','equity','internal') AND p_pnl_class<>'none' THEN RAISE EXCEPTION 'Assets, liabilities, equity and internal accounts cannot affect P&L'; END IF;
  IF p_ledger_type='income' AND p_pnl_class NOT IN ('revenue','other_income') THEN RAISE EXCEPTION 'Income ledger must use revenue or other_income'; END IF;
  IF p_ledger_type='expense' AND p_pnl_class NOT IN ('cogs','variable_expense','operating_expense','finance_cost','tax','other_expense') THEN RAISE EXCEPTION 'Expense ledger must use a valid P&L expense class'; END IF;
  INSERT INTO public.finance_ledger_accounts(code,name,ledger_type,pnl_class,pricing_relevant,parent_id,description) VALUES(trim(p_code),trim(p_name),p_ledger_type,p_pnl_class,p_pricing_relevant,p_parent_id,p_description) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_finance_ledger_account(text,text,text,text,boolean,text,uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_finance_ledger_transaction_activity AS
SELECT bt.id AS bank_transaction_id,bt.transaction_date,bt.description,bt.merchant,bt.reference,bt.type,bt.amount,bt.balance,bt.reconciliation_status,bt.transaction_category,bt.accounting_category,
       la.id AS ledger_account_id,la.code AS ledger_code,la.name AS ledger_name,la.ledger_type,la.pnl_class,la.pricing_relevant,(la.pnl_class<>'none') AS affects_pnl,
       CASE WHEN la.ledger_type='asset' THEN 'Balance sheet asset' WHEN la.ledger_type='liability' THEN 'Balance sheet liability' WHEN la.ledger_type='equity' THEN 'Equity' WHEN la.ledger_type='internal' THEN 'Internal / transfer' WHEN la.pnl_class IN ('revenue','other_income') THEN 'P&L income' WHEN la.pnl_class IN ('cogs','variable_expense','operating_expense','finance_cost','tax','other_expense') THEN 'P&L expense' ELSE 'Unassigned' END AS financial_statement
FROM public.bank_transactions bt LEFT JOIN public.finance_ledger_accounts la ON la.id=bt.ledger_account_id;
GRANT SELECT ON public.v_finance_ledger_transaction_activity TO authenticated;

-- Keep the existing v_financial_bank_activity column order stable; append ledger fields only.
CREATE OR REPLACE VIEW public.v_financial_bank_activity AS
SELECT bt.id AS bank_transaction_id,bt.bank_account_id,bt.store_id,bt.transaction_date,bt.description,bt.amount,bt.type,bt.balance,bt.reference,bt.merchant,bt.transaction_category,bt.accounting_category,bt.classification_status,bt.supplier_invoice_id,bt.expense_id,bt.customer_id,bt.reconciled_with_order_id,
       CASE WHEN bt.type='credit' AND la.pnl_class IN ('revenue','other_income') THEN bt.amount ELSE 0 END AS classified_income,
       CASE WHEN bt.type='debit' AND la.pnl_class IN ('cogs','variable_expense','operating_expense','finance_cost','tax','other_expense') THEN bt.amount ELSE 0 END AS classified_outflow,
       (la.pnl_class<>'none') AS affects_pnl,
       bt.ledger_account_id AS ledger_account_id,la.ledger_type,la.name AS ledger_name,la.code AS ledger_code,la.pnl_class
FROM public.bank_transactions bt LEFT JOIN public.finance_ledger_accounts la ON la.id=bt.ledger_account_id;

NOTIFY pgrst,'reload schema';
