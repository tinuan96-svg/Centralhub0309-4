/*
  # Fix public bucket listing + add product_slug_history RLS policy

  1. Storage: Remove the broad "Public can view product media" SELECT policy on
     storage.objects. Public buckets serve files by URL without needing a SELECT
     policy on storage.objects — the broad policy only enables directory listing
     which leaks all filenames to unauthenticated callers.

  2. product_slug_history: RLS is enabled but there are no policies, meaning
     no one can read or write the table. Add a policy so authenticated users
     (admins) can select from it.
*/

-- Remove over-broad storage listing policy
DROP POLICY IF EXISTS "Public can view product media" ON storage.objects;

-- Allow authenticated admins to read product_slug_history
-- (the table tracks slug changes and is used for redirects)
CREATE POLICY "Authenticated users can read product_slug_history"
  ON public.product_slug_history
  FOR SELECT
  TO authenticated
  USING (true);
