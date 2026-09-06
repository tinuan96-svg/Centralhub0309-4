import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    const cols = ['brand', 'weight', 'stock', 'stock_quantity', 'is_active', 'is_featured', 'slug', 'description', 'image_url', 'category_id', 'sku', 'gtin', 'warehouse_location', 'main_category', 'sub_category', 'tax_rate'];
    const valid: string[] = ['name', 'price', 'unit'];

    for (const col of cols) {
        const payload: any = { name: 'Probe ' + col, price: 1, unit: 'Kg' };
        payload[col] = (col === 'weight' || col === 'stock' || col === 'stock_quantity' || col === 'tax_rate') ? 0 : 'test';
        if (col === 'is_active' || col === 'is_featured') payload[col] = true;

        const { error: err } = await supabase.from('products').insert(payload);
        if (!err || !err.message.includes('Could not find')) {
            valid.push(col);
            if (!err) await supabase.from('products').delete().eq('name', 'Probe ' + col);
        }
    }
    console.log("Valid columns discovered:", valid);
}

check();
