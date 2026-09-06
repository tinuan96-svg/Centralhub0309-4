import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'competitor_prices' });
  // If RPC doesn't exist, use direct query
  if (error) {
      const { data: cols } = await supabase.from('information_schema.columns' as any)
        .select('column_name')
        .eq('table_name', 'competitor_prices')
        .eq('table_schema', 'public');
      console.log("COLUMNS:", cols?.map((c: any) => c.column_name));
  } else {
      console.log("COLUMNS (via RPC):", data);
  }
}

run();
