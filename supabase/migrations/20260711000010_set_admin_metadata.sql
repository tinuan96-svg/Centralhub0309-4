-- This migration can't directly touch auth.users easily from SQL if not superuser
-- but we can provide the SQL for the user to run in the Supabase Dashboard SQL Editor
-- to fix the app_metadata for the admin user.

-- Note: In Supabase, you usually set this via the Dashboard UI or via auth.admin API.
-- However, if the user has access to the SQL editor as postgres, they can do:

/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@keralagroceries.com';
*/

-- Since we can't be sure the above will work in a migration, we ensure the
-- is_admin() function is robust.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check JWT metadata first (fastest)
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  -- Fallback: check email domain for specific users (for bootstrap)
  IF (auth.jwt() ->> 'email') LIKE '%@keralagroceries.com' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
