/*
  # Fix sender_profiles SELECT grant

  ## Problem
  The sender_profiles table was missing SELECT grants for the anon and authenticated
  roles. Only postgres and service_role had SELECT access. This caused the shipping
  service to receive null when querying for the default sender profile, resulting in
  "No sender profile found" errors when creating shipments.

  ## Fix
  Grant SELECT on sender_profiles to both anon and authenticated roles so the
  Supabase JS client can read the table. The existing RLS SELECT policy (qual: true)
  already allows all authenticated users to view profiles — the table-level grant
  was simply missing.
*/

GRANT SELECT ON public.sender_profiles TO anon, authenticated;
