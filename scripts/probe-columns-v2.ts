import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    const cols = ['product_type', 'type', 'is_active', 'is_featured', 'is_deleted', 'sku', 'description', 'image_url', 'category_id', 'created_at', 'updated_at', 'cost_price', 'stock_quantity'];
    const discovered: string[] = [];

    for (const col of cols) {
        const { error: err } = await supabase.from('products').insert({ name: 'Probe ' + col, price: 1, [col]: (col.includes('is_') ? true : 'test') });
        if (err) {
            if (err.message.includes('Could not find')) {
                // Not a column
            } else {
                discovered.push(col);
                // console.log(`Discovered ${col} but failed: ${err.message}`);
            }
        } else {
            discovered.push(col);
            await supabase.from('products').delete().eq('name', 'Probe ' + col);
        }
    }
    console.log("Newly discovered columns:", discovered);
}

check();
