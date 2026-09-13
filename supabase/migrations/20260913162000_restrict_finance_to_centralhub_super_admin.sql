-- CentralHub has a single super-admin login. Remove the legacy store_staff
-- authorization path from finance controls so finance data/actions cannot be
-- unlocked merely by a store staff row.

CREATE OR REPLACE FUNCTION public.finance_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.finance_can_manage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_can_manage() FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_can_manage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_manage() TO service_role;
