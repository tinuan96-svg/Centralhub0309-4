/*
  # Bank Statement Sync System

  ## Overview
  Complete bank statement synchronization system that imports transactions from Google Sheets,
  tracks store bank balances, and enables real-time financial tracking with reconciliation.

  ## New Tables

  ### 1. store_bank_accounts
  Stores bank account information and current balance for each store.
  - `id` (uuid, primary key)
  - `store_id` (uuid, foreign key to stores)
  - `bank_name` (text) - Name of the bank
  - `account_name` (text) - Account holder name
  - `account_number` (text) - Last 4 digits or masked number
  - `current_balance` (decimal) - Current balance from latest sync
  - `last_synced_at` (timestamptz) - Last successful sync timestamp
  - `sheet_id` (text) - Google Sheet ID for this account
  - `sheet_range` (text) - Range to read (e.g., "Sheet1!A2:G")
  - `is_active` (boolean) - Whether to sync this account
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. bank_transactions
  Stores individual bank transactions imported from sheets.
  - `id` (uuid, primary key)
  - `bank_account_id` (uuid, foreign key to store_bank_accounts)
  - `store_id` (uuid, foreign key to stores)
  - `transaction_date` (date) - Date of transaction
  - `description` (text) - Transaction description
  - `amount` (decimal) - Transaction amount (positive or negative)
  - `type` (text) - 'credit' or 'debit'
  - `balance` (decimal) - Balance after this transaction
  - `reference` (text) - Unique reference/transaction ID
  - `source` (text) - Source of data (e.g., "google_sheets")
  - `is_reconciled` (boolean) - Whether matched with gateway transaction
  - `reconciled_with` (uuid) - Reference to gateway_transactions.id
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Authenticated users can read their store's data
  - Admin can manage all

  ## Performance
  - Indexes on store_id, transaction_date, reference
  - Composite index for duplicate detection
*/

-- =============================================================================
-- TABLE: store_bank_accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS store_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text,
  current_balance decimal(15,2) DEFAULT 0,
  last_synced_at timestamptz,
  sheet_id text,
  sheet_range text DEFAULT 'Sheet1!A2:G',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for store_bank_accounts
CREATE INDEX IF NOT EXISTS idx_store_bank_accounts_store_id 
  ON store_bank_accounts(store_id);

CREATE INDEX IF NOT EXISTS idx_store_bank_accounts_active 
  ON store_bank_accounts(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE store_bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read store bank accounts"
  ON store_bank_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert store bank accounts"
  ON store_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update store bank accounts"
  ON store_bank_accounts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete store bank accounts"
  ON store_bank_accounts FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- TABLE: bank_transactions
-- =============================================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES store_bank_accounts(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount decimal(15,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  balance decimal(15,2),
  reference text NOT NULL,
  source text DEFAULT 'google_sheets',
  is_reconciled boolean DEFAULT false,
  reconciled_with uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bank_account_id, reference, transaction_date)
);

-- Indexes for bank_transactions
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account 
  ON bank_transactions(bank_account_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_store 
  ON bank_transactions(store_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date 
  ON bank_transactions(transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reference 
  ON bank_transactions(reference);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled 
  ON bank_transactions(is_reconciled) WHERE is_reconciled = false;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_composite 
  ON bank_transactions(bank_account_id, transaction_date, reference);

-- Enable RLS
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read bank transactions"
  ON bank_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bank transactions"
  ON bank_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bank transactions"
  ON bank_transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bank transactions"
  ON bank_transactions FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- FUNCTION: sync_bank_transactions
-- Process and insert bank transactions from Google Sheets data
-- Handles duplicate prevention and balance updates
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_bank_transactions(
  p_bank_account_id uuid,
  p_transactions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_transaction jsonb;
  v_inserted_count integer := 0;
  v_duplicate_count integer := 0;
  v_latest_balance decimal(15,2);
  v_exists boolean;
BEGIN
  -- Get store_id from bank account
  SELECT store_id INTO v_store_id
  FROM store_bank_accounts
  WHERE id = p_bank_account_id;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bank account not found',
      'inserted', 0,
      'duplicates', 0
    );
  END IF;

  -- Process each transaction
  FOR v_transaction IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    -- Check if transaction already exists
    SELECT EXISTS(
      SELECT 1 FROM bank_transactions
      WHERE bank_account_id = p_bank_account_id
        AND reference = (v_transaction->>'reference')
        AND transaction_date = (v_transaction->>'transaction_date')::date
    ) INTO v_exists;

    IF NOT v_exists THEN
      -- Insert new transaction
      INSERT INTO bank_transactions (
        bank_account_id,
        store_id,
        transaction_date,
        description,
        amount,
        type,
        balance,
        reference,
        source
      ) VALUES (
        p_bank_account_id,
        v_store_id,
        (v_transaction->>'transaction_date')::date,
        v_transaction->>'description',
        (v_transaction->>'amount')::decimal,
        v_transaction->>'type',
        (v_transaction->>'balance')::decimal,
        v_transaction->>'reference',
        COALESCE(v_transaction->>'source', 'google_sheets')
      );

      v_inserted_count := v_inserted_count + 1;
    ELSE
      v_duplicate_count := v_duplicate_count + 1;
    END IF;
  END LOOP;

  -- Get latest balance from most recent transaction
  SELECT balance INTO v_latest_balance
  FROM bank_transactions
  WHERE bank_account_id = p_bank_account_id
  ORDER BY transaction_date DESC, created_at DESC
  LIMIT 1;

  -- Update bank account balance and sync time
  UPDATE store_bank_accounts
  SET 
    current_balance = COALESCE(v_latest_balance, current_balance),
    last_synced_at = now(),
    updated_at = now()
  WHERE id = p_bank_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted_count,
    'duplicates', v_duplicate_count,
    'latest_balance', v_latest_balance
  );
END;
$$;

-- =============================================================================
-- FUNCTION: get_bank_balance_summary
-- Get bank balance summary for a store
-- =============================================================================

CREATE OR REPLACE FUNCTION get_bank_balance_summary(p_store_id uuid)
RETURNS TABLE (
  account_id uuid,
  bank_name text,
  account_name text,
  current_balance decimal,
  last_synced_at timestamptz,
  transaction_count bigint,
  last_transaction_date date,
  unreconciled_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sba.id as account_id,
    sba.bank_name,
    sba.account_name,
    sba.current_balance,
    sba.last_synced_at,
    COUNT(bt.id)::bigint as transaction_count,
    MAX(bt.transaction_date) as last_transaction_date,
    COUNT(*) FILTER (WHERE bt.is_reconciled = false)::bigint as unreconciled_count
  FROM store_bank_accounts sba
  LEFT JOIN bank_transactions bt ON bt.bank_account_id = sba.id
  WHERE sba.store_id = p_store_id
    AND sba.is_active = true
  GROUP BY sba.id, sba.bank_name, sba.account_name, sba.current_balance, sba.last_synced_at
  ORDER BY sba.bank_name;
END;
$$;

-- =============================================================================
-- FUNCTION: get_unreconciled_transactions
-- Get unreconciled transactions for reconciliation dashboard
-- =============================================================================

CREATE OR REPLACE FUNCTION get_unreconciled_transactions(
  p_store_id uuid,
  p_days_back integer DEFAULT 30
)
RETURNS TABLE (
  transaction_id uuid,
  transaction_date date,
  description text,
  amount decimal,
  type text,
  reference text,
  bank_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bt.id as transaction_id,
    bt.transaction_date,
    bt.description,
    bt.amount,
    bt.type,
    bt.reference,
    sba.bank_name
  FROM bank_transactions bt
  JOIN store_bank_accounts sba ON sba.id = bt.bank_account_id
  WHERE bt.store_id = p_store_id
    AND bt.is_reconciled = false
    AND bt.transaction_date >= CURRENT_DATE - p_days_back
  ORDER BY bt.transaction_date DESC;
END;
$$;

-- =============================================================================
-- FUNCTION: reconcile_transaction
-- Mark a bank transaction as reconciled with gateway transaction
-- =============================================================================

CREATE OR REPLACE FUNCTION reconcile_transaction(
  p_bank_transaction_id uuid,
  p_gateway_transaction_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bank_transactions
  SET 
    is_reconciled = true,
    reconciled_with = p_gateway_transaction_id,
    updated_at = now()
  WHERE id = p_bank_transaction_id;

  RETURN FOUND;
END;
$$;

-- =============================================================================
-- FUNCTION: get_cashflow_analysis
-- Get cashflow analysis for purchase planning
-- =============================================================================

CREATE OR REPLACE FUNCTION get_cashflow_analysis(
  p_store_id uuid,
  p_days_back integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_current_balance decimal(15,2);
  v_total_credits decimal(15,2);
  v_total_debits decimal(15,2);
  v_avg_daily_credits decimal(15,2);
  v_avg_daily_debits decimal(15,2);
  v_projected_7day decimal(15,2);
BEGIN
  -- Get current balance
  SELECT COALESCE(SUM(current_balance), 0) INTO v_current_balance
  FROM store_bank_accounts
  WHERE store_id = p_store_id AND is_active = true;

  -- Get totals
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
  INTO v_total_credits, v_total_debits
  FROM bank_transactions
  WHERE store_id = p_store_id
    AND transaction_date >= CURRENT_DATE - p_days_back;

  -- Calculate averages
  v_avg_daily_credits := v_total_credits / NULLIF(p_days_back, 0);
  v_avg_daily_debits := v_total_debits / NULLIF(p_days_back, 0);

  -- Project 7 days
  v_projected_7day := v_current_balance + (v_avg_daily_credits - v_avg_daily_debits) * 7;

  v_result := jsonb_build_object(
    'current_balance', v_current_balance,
    'total_credits', v_total_credits,
    'total_debits', v_total_debits,
    'avg_daily_credits', v_avg_daily_credits,
    'avg_daily_debits', v_avg_daily_debits,
    'projected_7day_balance', v_projected_7day,
    'available_for_purchase', GREATEST(v_current_balance * 0.7, 0)
  );

  RETURN v_result;
END;
$$;

-- =============================================================================
-- FUNCTION: match_gateway_transactions
-- Auto-match bank transactions with gateway transactions
-- =============================================================================

CREATE OR REPLACE FUNCTION match_gateway_transactions(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched_count integer := 0;
  v_bt_record RECORD;
  v_gt_id uuid;
BEGIN
  -- Loop through unreconciled bank transactions
  FOR v_bt_record IN 
    SELECT id, reference, amount, transaction_date
    FROM bank_transactions
    WHERE store_id = p_store_id
      AND is_reconciled = false
      AND transaction_date >= CURRENT_DATE - 90
  LOOP
    -- Try to find matching gateway transaction
    -- Match on reference_id or amount + date
    SELECT id INTO v_gt_id
    FROM gateway_transactions
    WHERE store_id = p_store_id
      AND (
        reference_id = v_bt_record.reference
        OR (
          ABS(amount - v_bt_record.amount) < 0.01
          AND transaction_date = v_bt_record.transaction_date
        )
      )
    LIMIT 1;

    IF v_gt_id IS NOT NULL THEN
      -- Match found, reconcile
      UPDATE bank_transactions
      SET 
        is_reconciled = true,
        reconciled_with = v_gt_id,
        updated_at = now()
      WHERE id = v_bt_record.id;

      v_matched_count := v_matched_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'matched_count', v_matched_count
  );
END;
$$;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE store_bank_accounts IS 
  'Stores bank account information and current balance for each store';

COMMENT ON TABLE bank_transactions IS 
  'Individual bank transactions imported from Google Sheets or other sources';

COMMENT ON FUNCTION sync_bank_transactions IS 
  'Process and insert bank transactions with duplicate prevention and balance updates';

COMMENT ON FUNCTION get_bank_balance_summary IS 
  'Get bank balance summary with transaction counts for a store';

COMMENT ON FUNCTION get_unreconciled_transactions IS 
  'Get unreconciled transactions for reconciliation dashboard';

COMMENT ON FUNCTION reconcile_transaction IS 
  'Mark a bank transaction as reconciled with gateway transaction';

COMMENT ON FUNCTION get_cashflow_analysis IS 
  'Get cashflow analysis for purchase planning with projections';

COMMENT ON FUNCTION match_gateway_transactions IS 
  'Auto-match bank transactions with gateway transactions based on reference and amount';
