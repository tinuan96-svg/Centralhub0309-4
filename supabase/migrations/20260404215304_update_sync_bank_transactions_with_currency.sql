/*
  # Update sync_bank_transactions to handle currency

  1. Changes
    - Add currency support to transaction sync
    - Trigger will auto-normalize all other fields

  2. Notes
    - The normalize_bank_transaction trigger handles:
      - normalized_amount
      - transaction_direction
      - is_transfer
      - is_valid
      - category_normalized
      - affects_balance
      - affects_profit
      - classification_confidence
      - merchant_normalized
*/

CREATE OR REPLACE FUNCTION sync_bank_transactions(
  p_bank_account_id uuid,
  p_transactions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      -- Insert new transaction (trigger will auto-normalize)
      INSERT INTO bank_transactions (
        bank_account_id,
        store_id,
        transaction_date,
        description,
        amount,
        type,
        balance,
        reference,
        currency,
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
        COALESCE(v_transaction->>'currency', 'GBP'),
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
