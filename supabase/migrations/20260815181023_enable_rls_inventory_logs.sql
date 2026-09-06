/*
  # Enable RLS on inventory_logs and add select policy for authenticated users
*/

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_inventory_logs_authenticated"
  ON public.inventory_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert_inventory_logs_authenticated"
  ON public.inventory_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "update_inventory_logs_authenticated"
  ON public.inventory_logs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also add an index on created_at for the common ORDER BY query
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at_desc
  ON public.inventory_logs (created_at DESC);

-- Add index on product_id for filtered queries
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id
  ON public.inventory_logs (product_id);

NOTIFY pgrst, 'reload schema';
