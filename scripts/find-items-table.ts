import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  const commonNames = [
    'order_items', 'items', 'line_items', 'ordered_items', 'order_product', 'products_ordered',
    'ecommerce_items', 'store_items', 'purchase_order_items'
  ];

  for (const name of commonNames) {
      const { status, error } = await supabase.from(name).select('*').limit(0);
      if (status === 200 || status === 401) {
          console.log(`✅ Table found: '${name}' (Status ${status})`);
      } else {
          // console.log(`❌ Table not found: '${name}' (Status ${status})`);
      }
  }
}

check();
