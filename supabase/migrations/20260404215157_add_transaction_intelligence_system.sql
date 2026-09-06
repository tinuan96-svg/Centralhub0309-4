/*
  # Add Transaction Intelligence System

  1. New Columns Added to `bank_transactions`
    - `normalized_amount` (numeric) - Always signed amount (+/-)
    - `transaction_direction` (text) - 'credit' or 'debit'
    - `is_transfer` (boolean) - Internal transfer flag
    - `is_valid` (boolean) - Valid for calculations
    - `category_normalized` (text) - Auto-classified category
    - `affects_balance` (boolean) - Should affect balance calculation
    - `affects_profit` (boolean) - Should affect profit calculation
    - `classification_confidence` (text) - 'high', 'medium', 'low'
    - `merchant_normalized` (text) - Normalized merchant name

  2. Purpose
    - Eliminate incorrect balance calculations from transfers
    - Ignore zero-value transactions
    - Auto-classify transactions for profit tracking
    - Enable intelligent reconciliation

  3. Migration Strategy
    - Add columns with safe defaults
    - Existing data remains intact
    - New transactions will be auto-classified
*/

-- Add new intelligence columns to bank_transactions
DO $$
BEGIN
  -- Normalized amount (signed)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'normalized_amount'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN normalized_amount numeric DEFAULT 0;
  END IF;

  -- Transaction direction
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'transaction_direction'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN transaction_direction text CHECK (transaction_direction IN ('credit', 'debit'));
  END IF;

  -- Transfer detection
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'is_transfer'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN is_transfer boolean DEFAULT false;
  END IF;

  -- Validation flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'is_valid'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN is_valid boolean DEFAULT true;
  END IF;

  -- Normalized category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'category_normalized'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN category_normalized text DEFAULT 'uncategorized';
  END IF;

  -- Balance impact flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'affects_balance'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN affects_balance boolean DEFAULT true;
  END IF;

  -- Profit impact flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'affects_profit'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN affects_profit boolean DEFAULT true;
  END IF;

  -- Classification confidence
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'classification_confidence'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN classification_confidence text CHECK (classification_confidence IN ('high', 'medium', 'low'));
  END IF;

  -- Normalized merchant name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'merchant_normalized'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN merchant_normalized text;
  END IF;
END $$;

-- Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_bank_transactions_valid ON bank_transactions(is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_affects_balance ON bank_transactions(affects_balance) WHERE affects_balance = true;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category_normalized ON bank_transactions(category_normalized);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_is_transfer ON bank_transactions(is_transfer) WHERE is_transfer = true;

-- Create helper function to normalize transactions
CREATE OR REPLACE FUNCTION normalize_bank_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Set normalized amount based on type
  IF NEW.type = 'debit' THEN
    NEW.normalized_amount := -ABS(NEW.amount);
    NEW.transaction_direction := 'debit';
  ELSE
    NEW.normalized_amount := ABS(NEW.amount);
    NEW.transaction_direction := 'credit';
  END IF;

  -- Detect transfers based on description patterns
  IF NEW.description ILIKE '%Monzo-to-Monzo%' 
     OR NEW.description ILIKE '%transfer%'
     OR NEW.description ILIKE '%internal%' THEN
    NEW.is_transfer := true;
  ELSE
    NEW.is_transfer := false;
  END IF;

  -- Validate transaction
  IF NEW.amount = 0 OR NEW.amount IS NULL THEN
    NEW.is_valid := false;
  ELSE
    NEW.is_valid := true;
  END IF;

  -- Set affects_balance flag
  NEW.affects_balance := NEW.is_valid AND NOT NEW.is_transfer;

  -- Set affects_profit flag
  NEW.affects_profit := NEW.is_valid AND NOT NEW.is_transfer;

  -- Normalize merchant name
  NEW.merchant_normalized := UPPER(TRIM(COALESCE(NEW.description, '')));

  -- Auto-classify based on merchant patterns
  IF NEW.merchant_normalized ILIKE '%SQUARE%' THEN
    NEW.category_normalized := 'sales_income';
    NEW.classification_confidence := 'high';
  ELSIF NEW.merchant_normalized ILIKE '%TRUE VALUE%' THEN
    NEW.category_normalized := 'supplier_payment';
    NEW.classification_confidence := 'high';
  ELSIF NEW.merchant_normalized ILIKE '%GOOGLE%' THEN
    NEW.category_normalized := 'software_or_marketing';
    NEW.classification_confidence := 'medium';
  ELSIF NEW.merchant_normalized ILIKE '%PAYPAL%' THEN
    NEW.category_normalized := 'payment_gateway';
    NEW.classification_confidence := 'medium';
  ELSIF NEW.merchant_normalized ILIKE '%ENVATO%' THEN
    NEW.category_normalized := 'software_tools';
    NEW.classification_confidence := 'high';
  ELSIF NEW.merchant_normalized ILIKE '%TWILIO%' THEN
    NEW.category_normalized := 'communication_tools';
    NEW.classification_confidence := 'high';
  ELSIF NEW.merchant_normalized ILIKE '%STRIPE%' THEN
    NEW.category_normalized := 'payment_gateway';
    NEW.classification_confidence := 'high';
  ELSIF NEW.merchant_normalized ILIKE '%AMAZON%' THEN
    NEW.category_normalized := 'supplies';
    NEW.classification_confidence := 'medium';
  ELSIF NEW.is_transfer THEN
    NEW.category_normalized := 'internal_transfer';
    NEW.classification_confidence := 'high';
  ELSE
    NEW.category_normalized := 'uncategorized';
    NEW.classification_confidence := 'low';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_normalize_bank_transaction ON bank_transactions;

-- Create trigger for auto-normalization
CREATE TRIGGER trigger_normalize_bank_transaction
  BEFORE INSERT OR UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION normalize_bank_transaction();

-- Backfill existing transactions
UPDATE bank_transactions SET updated_at = NOW() WHERE normalized_amount IS NULL OR normalized_amount = 0;

COMMENT ON COLUMN bank_transactions.normalized_amount IS 'Signed amount: positive for credits, negative for debits';
COMMENT ON COLUMN bank_transactions.is_transfer IS 'True if this is an internal transfer (should not affect balance)';
COMMENT ON COLUMN bank_transactions.is_valid IS 'False if amount is zero or transaction should be ignored';
COMMENT ON COLUMN bank_transactions.affects_balance IS 'True if this transaction should affect balance calculations';
COMMENT ON COLUMN bank_transactions.affects_profit IS 'True if this transaction should affect profit calculations';
