import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    const tests = [
        { col: 'is_active', val: true },
        { col: 'is_featured', val: true },
        { col: 'is_deleted', val: false },
        { col: 'sku', val: 'SKU123' },
        { col: 'description', val: 'desc' },
        { col: 'image_url', val: 'http://image' },
        { col: 'category_id', val: null },
        { col: 'created_at', val: new Date().toISOString() },
        { col: 'updated_at', val: new Date().toISOString() },
        { col: 'cost_price', val: 0.5 },
        { col: 'stock_quantity', val: 10 }
    ];
    const discovered: string[] = [];

    for (const t of tests) {
        const { error: err } = await supabase.from('products').insert({ name: 'Probe ' + t.col, price: 1, [t.col]: t.val });
        if (err) {
            if (err.message.includes('Could not find')) {
                // console.log(`${t.col} NOT found`);
            } else {
                discovered.push(t.col);
                // console.log(`Discovered ${t.col} (with error: ${err.message})`);
            }
        } else {
            discovered.push(t.col);
            await supabase.from('products').delete().eq('name', 'Probe ' + t.col);
        }
    }
    console.log("Newly discovered columns:", discovered);
}

check();
