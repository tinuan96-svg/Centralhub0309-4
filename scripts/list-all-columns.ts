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
    // If RPC doesn't exist, try a raw query if possible, but usually we can't do raw SQL via client
    // Let's try to fetch one row and look at all keys
    const { data: rows, error: fetchError } = await supabase.from('products').select('*').limit(1);
    if (fetchError) {
        console.error('Fetch error:', fetchError);
    } else {
        console.log('Columns from select *:', Object.keys(rows[0] || {}));
    }
  } else {
    console.log('Columns from RPC:', data);
  }
}

run();
