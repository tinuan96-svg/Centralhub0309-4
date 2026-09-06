/*
  # Add INSERT policy for brands table

  1. Changes
    - Add INSERT policy to allow authenticated users to create brands
    
  2. Security
    - Only authenticated users can insert brands
*/

-- Drop policy if exists and recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can create brands" ON brands;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Allow authenticated users to insert brands
CREATE POLICY "Authenticated users can create brands"
  ON brands
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
