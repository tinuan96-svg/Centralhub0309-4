import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  const commonNames = [
    'order_items', 'items', 'line_items', 'ordered_products', 'order_details',
    'order_products', 'products_ordered', 'malluspices_order_items',
    'keralagroceries_order_items'
  ];

  for (const name of commonNames) {
    const { error } = await supabase.from(name).select('*').limit(1);
    if (!error) {
      console.log(`✅ Table exists: ${name}`);
    } else if (error.message.includes('permission denied')) {
      console.log(`🔒 Table exists (RLS): ${name}`);
    } else if (error.code !== 'PGRST204' && error.code !== 'PGRST205') {
      console.log(`⚠️ Table ${name} returned error: ${error.code} - ${error.message}`);
    }
  }
}

check();
