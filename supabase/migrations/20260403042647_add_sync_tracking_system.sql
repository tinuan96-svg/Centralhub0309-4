/*
  # Add Sync Tracking System

  1. New Tables
    - `product_sync_logs`
      - `id` (uuid, primary key)
      - `product_id` (uuid, references products)
      - `store_id` (uuid, references stores)
      - `sync_status` (text) - 'synced', 'out_of_sync', 'error'
      - `mismatched_fields` (jsonb) - Array of mismatched field details
      - `sync_action` (text) - 'verified', 'synced', 'failed'
      - `error_message` (text, nullable)
      - `created_at` (timestamp)
      - `created_by` (uuid, references auth.users, nullable)

  2. Security
    - Enable RLS on `product_sync_logs` table
    - Add policy for authenticated users to read sync logs
    - Add policy for authenticated users to insert sync logs

  3. Indexes
    - Index on product_id for faster lookups
    - Index on store_id for filtering by store
    - Index on created_at for chronological queries
*/

-- Create product_sync_logs table
CREATE TABLE IF NOT EXISTS product_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sync_status text NOT NULL CHECK (sync_status IN ('synced', 'out_of_sync', 'error')),
  mismatched_fields jsonb DEFAULT '[]'::jsonb,
  sync_action text NOT NULL CHECK (sync_action IN ('verified', 'synced', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_product_id ON product_sync_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_store_id ON product_sync_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_product_sync_logs_created_at ON product_sync_logs(created_at DESC);

-- Enable RLS
ALTER TABLE product_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all sync logs
CREATE POLICY "Authenticated users can read sync logs"
  ON product_sync_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert sync logs
CREATE POLICY "Authenticated users can insert sync logs"
  ON product_sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE product_sync_logs IS 'Tracks synchronization status between CentralHub and storefronts';
COMMENT ON COLUMN product_sync_logs.mismatched_fields IS 'JSON array of mismatched field details with centralhub_value and website_value';
