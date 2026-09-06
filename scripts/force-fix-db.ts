import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Attempting to create dummy pricing_rules table to stop triggers from crashing...");

  // We try to create it via RPC or just a direct query if possible (unlikely to work via Postgrest)
  // Most Supabase setups don't allow DDL via Postgrest.

  console.log("Please run this in your Supabase SQL Editor to clear ALL product triggers:");
  console.log(`
DO $$
DECLARE
    t_name text;
BEGIN
    FOR t_name IN (
        SELECT tgname
        FROM pg_trigger
        JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
        WHERE pg_class.relname = 'products'
        AND NOT tgisinternal
    )
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(t_name) || ' ON products;';
    END LOOP;
END $$;
  `);

  console.log("\nAlternatively, run this to create the missing table that the trigger is looking for:");
  console.log("CREATE TABLE IF NOT EXISTS public.pricing_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());");
}

run();
