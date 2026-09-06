import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Listing all triggers on 'products' table...");

  const { data, error } = await supabase.rpc('get_table_triggers', { t_name: 'products' });

  if (error) {
    // If RPC doesn't exist, try to query pg_trigger directly if possible
    console.log("RPC failed. Attempting direct query...");
    const { data: triggers, error: err2 } = await supabase
      .from('pg_trigger')
      .select('tgname')
      .eq('tgrelid', (await supabase.from('pg_class').select('oid').eq('relname', 'products').single()).data?.oid);

    if (err2) {
      console.error("Failed to list triggers:", err2);
    } else {
      console.log("Triggers found:", triggers.map(t => t.tgname));
    }
  } else {
    console.log("Triggers found (RPC):", data);
  }
}

run();
