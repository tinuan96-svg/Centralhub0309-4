-- Replace the old manually imported bank statement with the live MalluSpices Google Sheet.
-- The existing Google Sheet configuration belongs to MalluSpices, not Kerala Grocery.

ALTER TABLE public.store_bank_accounts
  ADD COLUMN IF NOT EXISTS google_sheet_id text,
  ADD COLUMN IF NOT EXISTS google_sheet_name text,
  ADD COLUMN IF NOT EXISTS google_sheet_range text,
  ADD COLUMN IF NOT EXISTS balance_anchor numeric(15,2),
  ADD COLUMN IF NOT EXISTS balance_anchor_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS balance_source text,
  ADD COLUMN IF NOT EXISTS sync_source text;

DO $$
DECLARE
  v_malluspices_id uuid;
  v_google_account_id uuid;
BEGIN
  SELECT id INTO v_malluspices_id
  FROM public.stores
  WHERE lower(slug) = 'malluspices' OR lower(name) = 'malluspices'
  ORDER BY CASE WHEN lower(slug) = 'malluspices' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_malluspices_id IS NULL THEN
    RAISE EXCEPTION 'MalluSpices store was not found';
  END IF;

  -- Locate the account already configured for the live Google Sheet.
  SELECT id INTO v_google_account_id
  FROM public.store_bank_accounts
  WHERE google_sheet_id = '1PEEC_xQs3KvdN44xvkBt_tjmgd3ovo5h5jjxYOtGUBg'
     OR account_name = 'Monzo Business Account'
  ORDER BY CASE WHEN google_sheet_id = '1PEEC_xQs3KvdN44xvkBt_tjmgd3ovo5h5jjxYOtGUBg' THEN 0 ELSE 1 END,
           updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_google_account_id IS NULL THEN
    INSERT INTO public.store_bank_accounts
      (store_id, bank_name, account_name, currency, current_balance, is_active,
       google_sheet_id, google_sheet_name, google_sheet_range, balance_anchor,
       balance_anchor_at, balance_source, sync_source, updated_at)
    VALUES
      (v_malluspices_id, 'Monzo', 'MalluSpices Monzo Business Account', 'GBP', 0, true,
       '1PEEC_xQs3KvdN44xvkBt_tjmgd3ovo5h5jjxYOtGUBg', 'Business Account Transactions',
       'Business Account Transactions!A:Q', 0.89,
       '2026-08-30 21:38:23+00', 'calculated_from_google_sheet_anchor', 'google_sheets', now());
    SELECT id INTO v_google_account_id
    FROM public.store_bank_accounts
    WHERE store_id = v_malluspices_id
      AND google_sheet_id = '1PEEC_xQs3KvdN44xvkBt_tjmgd3ovo5h5jjxYOtGUBg'
    LIMIT 1;
  ELSE
    -- This account is the live statement account; move it to MalluSpices.
    UPDATE public.store_bank_accounts
    SET store_id = v_malluspices_id,
        bank_name = 'Monzo',
        account_name = 'MalluSpices Monzo Business Account',
        google_sheet_id = '1PEEC_xQs3KvdN44xvkBt_tjmgd3ovo5h5jjxYOtGUBg',
        google_sheet_name = 'Business Account Transactions',
        google_sheet_range = 'Business Account Transactions!A:Q',
        balance_anchor = 0.89,
        balance_anchor_at = '2026-08-30 21:38:23+00',
        balance_source = 'calculated_from_google_sheet_anchor',
        sync_source = 'google_sheets',
        updated_at = now()
    WHERE id = v_google_account_id;
  END IF;

  -- The 2,372 rows currently on this account are the old manual CSV import.
  -- Remove them so the Google Sheet becomes the single source of truth.
  DELETE FROM public.bank_transactions
  WHERE bank_account_id = v_google_account_id
    AND source = 'monzo_csv';

  -- Any surviving transactions on the live account must belong to MalluSpices.
  UPDATE public.bank_transactions
  SET store_id = v_malluspices_id,
      source = CASE WHEN source IS NULL OR source = 'monzo_csv' THEN 'google_sheets' ELSE source END,
      updated_at = now()
  WHERE bank_account_id = v_google_account_id;

  UPDATE public.store_bank_accounts
  SET current_balance = 0,
      last_synced_at = NULL,
      sync_source = 'google_sheets',
      updated_at = now()
  WHERE id = v_google_account_id;
END $$;

-- Keep the sync RPC from ever leaving an existing matched row attached to the wrong store.
CREATE OR REPLACE FUNCTION public.sync_bank_transactions(
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
  v_anchor numeric(15,2);
  v_anchor_date date;
  v_anchor_time time;
  v_anchor_cumulative numeric := 0;
  v_opening_balance numeric;
  v_latest_balance numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_duplicates integer := 0;
  v_tx jsonb;
  v_existing_id uuid;
BEGIN
  SELECT store_id, balance_anchor,
         (balance_anchor_at AT TIME ZONE 'Europe/London')::date,
         (balance_anchor_at AT TIME ZONE 'Europe/London')::time
  INTO v_store_id, v_anchor, v_anchor_date, v_anchor_time
  FROM public.store_bank_accounts WHERE id = p_bank_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank account not found');
  END IF;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank account is not assigned to a store');
  END IF;

  CREATE TEMP TABLE tmp_monzo_sync (
    ord bigint,
    transaction_date date NOT NULL,
    transaction_time time,
    description text,
    amount numeric(15,2) NOT NULL,
    type text NOT NULL,
    reference text,
    merchant text,
    category text,
    notes text,
    source_row_hash text,
    calculated_balance numeric(15,2)
  ) ON COMMIT DROP;

  INSERT INTO tmp_monzo_sync
    (ord, transaction_date, transaction_time, description, amount, type, reference, merchant, category, notes, source_row_hash)
  SELECT ord, (x->>'transaction_date')::date, NULLIF(x->>'transaction_time','')::time,
    NULLIF(x->>'description',''), abs((x->>'amount')::numeric), lower(coalesce(x->>'type','debit')),
    NULLIF(x->>'reference',''), NULLIF(x->>'merchant',''), NULLIF(x->>'category',''), NULLIF(x->>'notes',''), NULLIF(x->>'source_row_hash','')
  FROM jsonb_array_elements(coalesce(p_transactions,'[]'::jsonb)) WITH ORDINALITY AS a(x, ord)
  WHERE coalesce(x->>'reference','') <> '' AND coalesce(x->>'transaction_date','') <> '' AND coalesce(x->>'amount','') <> '';

  IF NOT EXISTS (SELECT 1 FROM tmp_monzo_sync) THEN
    UPDATE public.store_bank_accounts SET last_synced_at = now(), updated_at = now() WHERE id = p_bank_account_id;
    RETURN jsonb_build_object('success', true, 'inserted', 0, 'updated', 0, 'duplicates', 0, 'latest_balance', NULL);
  END IF;

  SELECT coalesce(sum(CASE WHEN type = 'credit' THEN amount ELSE -amount END),0)
    INTO v_anchor_cumulative
    FROM tmp_monzo_sync
    WHERE v_anchor IS NOT NULL AND v_anchor_date IS NOT NULL
      AND (transaction_date < v_anchor_date
        OR (transaction_date = v_anchor_date AND coalesce(transaction_time,time '00:00:00') <= coalesce(v_anchor_time,time '23:59:59')));

  IF v_anchor IS NOT NULL AND v_anchor_date IS NOT NULL THEN
    v_opening_balance := v_anchor - v_anchor_cumulative;
  ELSE
    SELECT coalesce(current_balance,0) INTO v_opening_balance
    FROM public.store_bank_accounts WHERE id = p_bank_account_id;
  END IF;

  WITH calculated AS (
    SELECT ord,
      v_opening_balance + sum(CASE WHEN type = 'credit' THEN amount ELSE -amount END)
        OVER (ORDER BY transaction_date, coalesce(transaction_time,time '00:00:00'), ord ROWS UNBOUNDED PRECEDING) AS bal
    FROM tmp_monzo_sync
  )
  UPDATE tmp_monzo_sync t SET calculated_balance = round(c.bal,2)
  FROM calculated c WHERE c.ord = t.ord;

  FOR v_tx IN
    SELECT to_jsonb(t) FROM tmp_monzo_sync t
    ORDER BY transaction_date, coalesce(transaction_time,time '00:00:00'), ord
  LOOP
    SELECT id INTO v_existing_id FROM public.bank_transactions
    WHERE bank_account_id = p_bank_account_id AND reference = v_tx->>'reference' LIMIT 1;

    IF v_existing_id IS NULL THEN
      SELECT b.id INTO v_existing_id FROM public.bank_transactions b
      WHERE b.bank_account_id = p_bank_account_id AND b.source = 'monzo_csv'
        AND b.transaction_date = (v_tx->>'transaction_date')::date
        AND b.description IS NOT DISTINCT FROM NULLIF(v_tx->>'description','')
        AND b.amount = (v_tx->>'amount')::numeric AND b.type = v_tx->>'type'
      ORDER BY b.created_at LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.bank_transactions SET
          store_id = v_store_id,
          transaction_time = NULLIF(v_tx->>'transaction_time','')::time,
          description = NULLIF(v_tx->>'description',''), amount = (v_tx->>'amount')::numeric,
          type = v_tx->>'type', balance = (v_tx->>'calculated_balance')::numeric,
          reference = v_tx->>'reference', merchant = NULLIF(v_tx->>'merchant',''),
          category = NULLIF(v_tx->>'category',''), notes = NULLIF(v_tx->>'notes',''),
          source = 'google_sheets', source_row_hash = NULLIF(v_tx->>'source_row_hash',''), updated_at = now()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
      END IF;
    END IF;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.bank_transactions
        (bank_account_id, store_id, transaction_date, transaction_time, description, amount, type, balance,
         reference, merchant, category, notes, source, source_row_hash, updated_at)
      VALUES
        (p_bank_account_id, v_store_id, (v_tx->>'transaction_date')::date,
         NULLIF(v_tx->>'transaction_time','')::time, NULLIF(v_tx->>'description',''),
         (v_tx->>'amount')::numeric, v_tx->>'type', (v_tx->>'calculated_balance')::numeric,
         v_tx->>'reference', NULLIF(v_tx->>'merchant',''), NULLIF(v_tx->>'category',''),
         NULLIF(v_tx->>'notes',''), 'google_sheets', NULLIF(v_tx->>'source_row_hash',''), now());
      v_inserted := v_inserted + 1;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;
  END LOOP;

  SELECT balance INTO v_latest_balance FROM public.bank_transactions
  WHERE bank_account_id = p_bank_account_id
  ORDER BY transaction_date DESC, transaction_time DESC NULLS LAST, updated_at DESC LIMIT 1;

  UPDATE public.store_bank_accounts
  SET current_balance = coalesce(v_latest_balance,current_balance),
      last_synced_at = now(), updated_at = now(), sync_source = 'google_sheets'
  WHERE id = p_bank_account_id;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'updated', v_updated,
    'duplicates', v_duplicates, 'latest_balance', v_latest_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_bank_transactions(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_bank_transactions(uuid, jsonb) TO service_role;
