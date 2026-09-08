-- Restrict ledger-head creation to authenticated CentralHub administrators.
REVOKE EXECUTE ON FUNCTION public.create_finance_ledger_account(text,text,text,text,boolean,text,uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_finance_ledger_account(text,text,text,text,boolean,text,uuid) TO authenticated;
