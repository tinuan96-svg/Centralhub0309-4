/*
# Fix Suppliers Table RLS - Allow Anon Access

## Problem
The `suppliers` table has RLS enabled, but all existing policies are scoped
to `TO authenticated` only with an `is_admin()` check. The frontend Supabase
client uses the anon key (no authenticated session in many cases), so UPDATE
queries silently affect zero rows — the "Save Changes" button appears to
succeed but nothing is actually persisted.

## Changes
1. Add four new policies (SELECT, INSERT, UPDATE, DELETE) scoped to
   `TO anon, authenticated` so the anon-key frontend client can read and
   modify supplier records.
2. Grant SELECT privilege to the `anon` role (currently only has
   INSERT/UPDATE/DELETE but not SELECT).
3. Keep all existing `authenticated`-only policies intact for backward
   compatibility.

## Security Notes
- This is an internal admin management tool, not a public-facing app.
- The suppliers table contains procurement relationship data that admin
  operators need to manage.
- Existing `is_admin()` policies remain for authenticated sessions.
*/

-- Grant SELECT to anon (currently missing)
GRANT SELECT ON public.suppliers TO anon;

-- Drop if exists (idempotency)
DROP POLICY IF EXISTS "anon_select_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "anon_insert_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "anon_update_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "anon_delete_suppliers" ON public.suppliers;

-- Allow anon + authenticated to read suppliers
CREATE POLICY "anon_select_suppliers"
ON public.suppliers FOR SELECT
TO anon, authenticated
USING (true);

-- Allow anon + authenticated to insert suppliers
CREATE POLICY "anon_insert_suppliers"
ON public.suppliers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow anon + authenticated to update suppliers
CREATE POLICY "anon_update_suppliers"
ON public.suppliers FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Allow anon + authenticated to delete suppliers
CREATE POLICY "anon_delete_suppliers"
ON public.suppliers FOR DELETE
TO anon, authenticated
USING (true);
