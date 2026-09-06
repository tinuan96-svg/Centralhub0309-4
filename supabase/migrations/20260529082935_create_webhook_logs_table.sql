/*
  # Create webhook_logs table

  Stores a log entry for every outbound webhook dispatch attempt,
  including retries. Used by the Sync Status admin page.

  1. New Table: webhook_logs
     - id (uuid PK)
     - event_type (INSERT | UPDATE | DELETE)
     - product_id (text)
     - product_name (text)
     - attempt (int, 1-based retry number)
     - status_code (int, HTTP response code or 0 for network error)
     - response_body (text)
     - success (boolean)
     - created_at (timestamptz)

  2. Security
     - RLS enabled; only authenticated users can read
     - Edge function uses service role, so inserts bypass RLS
*/

CREATE TABLE IF NOT EXISTS webhook_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text NOT NULL,
  product_id    text NOT NULL DEFAULT '',
  product_name  text NOT NULL DEFAULT '',
  attempt       int  NOT NULL DEFAULT 1,
  status_code   int  NOT NULL DEFAULT 0,
  response_body text NOT NULL DEFAULT '',
  success       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx ON webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_success_idx    ON webhook_logs (success, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_product_id_idx ON webhook_logs (product_id);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read webhook logs"
  ON webhook_logs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert webhook logs"
  ON webhook_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
