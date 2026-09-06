import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Querying information_schema.triggers instead of pg_trigger which is often restricted
  const { data, error } = await supabase
    .from('information_schema.triggers')
    .select('trigger_name, event_object_table, action_statement')
    .eq('event_object_table', 'products');

  if (error) {
    console.log("Error querying information_schema.triggers:", error.message);
  } else {
    console.log("Triggers on products table:");
    console.table(data);
  }
}

run();
