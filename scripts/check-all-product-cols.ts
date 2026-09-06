import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    const cols = Object.keys(data[0] || {});
    console.log('Product Columns:', cols);
    console.log('has is_active:', cols.includes('is_active'));
    console.log('has is_deleted:', cols.includes('is_deleted'));
    console.log('has sku:', cols.includes('sku'));
    console.log('has gtin:', cols.includes('gtin'));
  }
}

check();
