import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Identifying broken triggers...");

  const sql = `
    -- Drop the broken trigger that is blocking deletions
    DROP TRIGGER IF EXISTS trigger_sync_keralagroceries_row ON products;
    DROP FUNCTION IF EXISTS public.sync_keralagroceries_row(uuid);
  `;

  console.log("Please run the following SQL in your Supabase SQL Editor to fix the broken trigger:");
  console.log(sql);
}

run();
