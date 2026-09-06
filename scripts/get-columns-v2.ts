import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'products' });
  if (error) {
    console.log("RPC get_table_columns failed, trying another way...");
    // Try to insert an empty object to see what error we get, sometimes it lists columns
    const { error: insError } = await supabase.from('products').insert({ non_existent_column: 1 });
    console.log("Insert Error:", insError?.message);
  } else {
    console.log("Columns:", data);
  }
}

run();
