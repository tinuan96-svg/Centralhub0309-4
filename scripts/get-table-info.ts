import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  // Try to find ANY table that has an order_id column
  // We can't do this directly with Postgrest, but we can probe.

  const tables = ['order_items', 'items', 'line_items', 'ordered_products', 'order_details', 'order_item', 'ordered_item'];

  for (const t of tables) {
      const { status, error } = await supabase.from(t).select('*').limit(1);
      console.log(`Table ${t}: Status ${status} ${error ? error.message : 'OK'}`);
  }
}

check();
