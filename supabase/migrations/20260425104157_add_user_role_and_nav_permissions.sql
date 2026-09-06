/*
  # Add user role and nav permissions

  ## Changes
  1. Add `profile_role` and `is_active` columns to existing `user_profiles` table
  2. Create new `user_nav_permissions` table
  3. Add `is_admin()` helper function
  4. Set up RLS policies
  5. Add trigger to auto-create profile on signup

  ## Columns added to user_profiles
  - `profile_role` (text: 'admin' | 'user', default 'user')
  - `is_active` (boolean, default true)
  - `full_name` (text, default '')
*/

-- Add columns to existing user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'profile_role'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN profile_role text NOT NULL DEFAULT 'user'
      CHECK (profile_role IN ('admin', 'user'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN full_name text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Helper: check if current user is admin via app_metadata
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Enable RLS on user_profiles if not already
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for user_profiles
DROP POLICY IF EXISTS "Select user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Insert user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Update user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Delete user profiles" ON user_profiles;

CREATE POLICY "Select user profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin() OR id = auth.uid());

CREATE POLICY "Insert user profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Update user profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Delete user profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (is_admin());

-- user_nav_permissions table
CREATE TABLE IF NOT EXISTS user_nav_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  nav_key text NOT NULL,
  is_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, nav_key)
);

ALTER TABLE user_nav_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select nav permissions"
  ON user_nav_permissions FOR SELECT
  TO authenticated
  USING (is_admin() OR user_id = auth.uid());

CREATE POLICY "Insert nav permissions"
  ON user_nav_permissions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Update nav permissions"
  ON user_nav_permissions FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Delete nav permissions"
  ON user_nav_permissions FOR DELETE
  TO authenticated
  USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_nav_permissions_user_id ON user_nav_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_profile_role ON user_profiles(profile_role);

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role text;
  v_full_name text;
BEGIN
  v_profile_role := COALESCE(NEW.raw_user_meta_data->>'profile_role', 'user');
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  INSERT INTO public.user_profiles (id, email, full_name, profile_role)
  VALUES (NEW.id, NEW.email, v_full_name, v_profile_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
