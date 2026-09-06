/*
  # Add INSERT policy for stores table

  Authenticated users (admins) can create new stores.
*/

CREATE POLICY "Authenticated users can insert stores"
  ON stores
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stores"
  ON stores
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete stores"
  ON stores
  FOR DELETE
  TO authenticated
  USING (true);
