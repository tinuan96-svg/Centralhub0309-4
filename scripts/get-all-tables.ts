import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Fetching all table information...');

  const probes = [
      'orders', 'products', 'order_items', 'order_item', 'items', 'line_items',
      'ordered_items', 'order_product', 'products_ordered', 'order_details', 'ordered_products'
  ];
  for (const p of probes) {
      const { status, error } = await supabase.from(p).select('*').limit(0);
      console.log(`Probe ${p}: Status ${status} ${error ? ('- ' + error.message) : ''}`);
  }
}

check();
