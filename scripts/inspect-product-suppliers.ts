import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function inspect() {
  const { data, error } = await supabase.from('product_suppliers').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
    return;
  }
  if (data && data.length > 0) {
    console.log('Columns in product_suppliers:', Object.keys(data[0]));
  } else {
    console.log('product_suppliers table is empty. Probing columns...');
    const cols = ['id', 'product_id', 'supplier_id', 'supplier_sku', 'cost_price', 'lead_time_days', 'minimum_order_qty', 'is_preferred', 'last_purchase_date', 'last_purchase_price', 'previous_cost_price', 'last_price_update'];
    for (const col of cols) {
      const { error: colError } = await supabase.from('product_suppliers').select(col).limit(1);
      console.log(`Column [${col}]: ${colError ? 'MISSING' : 'EXISTS'}`);
    }
  }
}

inspect();
