import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const malluSupabase = createClient(
  process.env.MALLUSPICES_SUPABASE_URL!,
  process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Checking MalluSpices tables...');

  // Try to find any table that might contain "item"
  const tableNames = ['order_items', 'items', 'line_items', 'ordered_products', 'order_details'];

  for (const name of tableNames) {
    const { data, error } = await malluSupabase.from(name).select('*').limit(1);
    if (!error) {
      console.log(`✅ Table found: ${name}. Columns:`, Object.keys(data[0] || {}));
    } else {
      console.log(`❌ Table not found: ${name}`);
    }
  }
}

check();
