-- Fix is_admin RPC to be more robust and support user_id argument
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_role text;
BEGIN
  -- 1. Determine which user to check
  v_user_id := COALESCE(user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Check user_profiles table (Source of Truth for CentralHub roles)
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = v_user_id
    AND (profile_role = 'admin' OR profile_role = 'superadmin' OR profile_role = 'administrator')
  ) THEN
    RETURN true;
  END IF;

  -- 3. Check auth metadata if checking current user
  IF v_user_id = auth.uid() THEN
    v_role := auth.jwt() -> 'app_metadata' ->> 'role';
    IF v_role = 'admin' OR v_role = 'superadmin' OR v_role = 'administrator' THEN
      RETURN true;
    END IF;

    -- Fallback: check email domain for specific users (bootstrap)
    v_email := auth.jwt() ->> 'email';
    IF v_email LIKE '%@keralagroceries.com' OR v_email LIKE '%@keralagroceries.co.uk' THEN
      RETURN true;
    END IF;
  END IF;

  -- 4. Check store_staff with 'admin' role
  IF EXISTS (
    SELECT 1 FROM public.store_staff
    WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;
