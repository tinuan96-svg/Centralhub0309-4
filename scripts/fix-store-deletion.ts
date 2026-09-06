import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Fixing store deletion issues...");

  const sql = `
    -- Create audit table for store deletions if it doesn't exist
    CREATE TABLE IF NOT EXISTS public.store_deletion_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL,
      store_name text NOT NULL,
      deleted_by uuid,
      deleted_at timestamptz DEFAULT now(),
      record_counts jsonb
    );

    -- Enable RLS
    ALTER TABLE public.store_deletion_audit ENABLE ROW LEVEL SECURITY;

    -- Add policies if they don't exist
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_deletion_audit' AND policyname = 'Admin users can view deletion audit') THEN
            CREATE POLICY "Admin users can view deletion audit"
              ON public.store_deletion_audit FOR SELECT
              TO authenticated
              USING (public.is_admin());
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_deletion_audit' AND policyname = 'Admin users can insert deletion audit') THEN
            CREATE POLICY "Admin users can insert deletion audit"
              ON public.store_deletion_audit FOR INSERT
              TO authenticated
              WITH CHECK (public.is_admin());
        END IF;
    END $$;
  `;

  try {
    // We can't run arbitrary SQL via the JS client easily unless we have an RPC
    // Let's check if we have a way to run this.
    // Usually Supabase doesn't allow raw SQL from JS client.

    // Instead, I'll try to find a migration that might be missing and suggest the user run it in the SQL editor.
    // OR I can check if there's an existing RPC that allows running SQL (unlikely in production).

    console.log("Please run the following SQL in your Supabase SQL Editor to fix the missing table:");
    console.log(sql);

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
