import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Searching for any table containing "item"...');

  const guesses = [
    'order_items', 'items', 'line_items', 'ordered_products', 'order_details',
    'purchase_order_items', 'packing_items', 'order_item', 'ordered_item'
  ];

  for (const g of guesses) {
      try {
          const { error: gErr } = await supabase.from(g).select('id').limit(1);
          if (!gErr) {
              console.log(`✅ Table found: ${g}`);
          } else if (gErr.message.includes('permission denied')) {
              console.log(`🔒 Table found (RLS): ${g}`);
          } else if (gErr.code !== 'PGRST204' && gErr.code !== 'PGRST205') {
              console.log(`⚠️ Table ${g} error: ${gErr.message}`);
          }
      } catch (e) {}
  }
}

check();
