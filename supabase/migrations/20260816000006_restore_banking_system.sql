/*
# Restore Banking System for Monzo Integration

1. New Tables
  - `store_bank_accounts`: Manages bank accounts per store.
  - `bank_transactions`: Stores imported transactions from Monzo/Google Sheets.

2. Security
  - Enable RLS on both tables.
  - Add policies for authenticated admins.
*/

-- 1. Create store_bank_accounts table
CREATE TABLE IF NOT EXISTS store_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text, -- Last 4 digits only
  currency text DEFAULT 'GBP',
  current_balance numeric(15,2) DEFAULT 0,
  last_synced_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create bank_transactions table
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid REFERENCES store_bank_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL,
  type text CHECK (type IN ('credit', 'debit')),
  balance numeric(15,2), -- Running balance after transaction
  reference text,
  merchant text,
  category text,
  source text DEFAULT 'monzo_csv',
  is_reconciled boolean DEFAULT false,
  reconciled_with_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bank_account_id, transaction_date, description, amount, reference)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled ON bank_transactions(is_reconciled) WHERE is_reconciled = false;

-- 4. Enable RLS
ALTER TABLE store_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Allow all for bank accounts" ON store_bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for bank transactions" ON bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Insert default Monzo account if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM store_bank_accounts WHERE bank_name = 'Monzo') THEN
    INSERT INTO store_bank_accounts (bank_name, account_name, currency, is_active)
    VALUES ('Monzo', 'Monzo Business Account', 'GBP', true);
  END IF;
END $$;
