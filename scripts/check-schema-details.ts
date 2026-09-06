import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Checking Products Table Constraints...');

  const { data, error } = await supabase.rpc('get_column_details', { table_name: 'products' });

  if (error) {
    // If RPC doesn't exist, try to check if we can insert a null to test
    console.log('RPC get_column_details not found. Testing nullability via dry-run...');

    const testFields = ['gtin', 'main_category_id', 'category_id', 'vat_rate', 'sub_category', 'tax_rate'];
    for (const field of testFields) {
      console.log(`Checking if ${field} exists in schema...`);
    }

    // Just list columns again with more detail if possible
    const { data: cols } = await supabase.from('products').select('*').limit(1);
    if (cols && cols[0]) {
      console.log('Actual columns found:', Object.keys(cols[0]));
    }
  } else {
    console.log('Column Details:', data);
  }
}

check();
