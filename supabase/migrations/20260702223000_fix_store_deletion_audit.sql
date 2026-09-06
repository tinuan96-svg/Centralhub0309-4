/*
  # Fix Store Deletion Audit Table

  ## Summary
  Creates the missing `store_deletion_audit` table and ensures proper RLS policies.
  This table is required by the `delete_store` function.
*/

-- Create audit table for store deletions if it doesn't exist
CREATE TABLE IF NOT EXISTS public.store_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  store_name text NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz DEFAULT now(),
  record_counts jsonb
);

-- Ensure foreign key to auth.users exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'store_deletion_audit_deleted_by_fkey'
    AND table_name = 'store_deletion_audit'
  ) THEN
    ALTER TABLE public.store_deletion_audit
    ADD CONSTRAINT store_deletion_audit_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.store_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Admin users can view deletion audit" ON public.store_deletion_audit;
CREATE POLICY "Admin users can view deletion audit"
  ON public.store_deletion_audit FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin users can insert deletion audit" ON public.store_deletion_audit;
CREATE POLICY "Admin users can insert deletion audit"
  ON public.store_deletion_audit FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
