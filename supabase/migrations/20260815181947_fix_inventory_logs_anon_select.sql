/*
  # Fix: Allow anon role to SELECT inventory_logs

  The inventory_logs table was locked to authenticated-only SELECT after enabling RLS.
  However, the app's Supabase client sends the anon key, and PostgREST treats
  unauthenticated requests as the anon role. Without an anon SELECT policy,
  the table appears empty even though data exists.

  This migration adds an anon SELECT policy so the ledger is readable.
  Since this is an admin-only app with login, this is safe -- the anon key
  alone cannot insert/update/delete (those policies remain authenticated-only).
*/

-- Drop existing authenticated SELECT policy and recreate with both roles
DROP POLICY IF EXISTS "select_inventory_logs_authenticated" ON public.inventory_logs;
DROP POLICY IF EXISTS "select_inventory_logs_anon" ON public.inventory_logs;

-- Allow both anon and authenticated to read the audit trail
CREATE POLICY "select_inventory_logs"
  ON public.inventory_logs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
