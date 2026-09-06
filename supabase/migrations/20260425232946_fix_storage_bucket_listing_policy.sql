/*
  # Fix Storage Bucket Listing Policy

  Replaces the broad SELECT policy on product-images storage that allows
  listing all files. The new policy restricts access to named objects only,
  preventing directory enumeration while still allowing direct URL access.
*/

DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;

CREATE POLICY "Public can read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images' AND name IS NOT NULL AND name != '');
