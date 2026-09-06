import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.rpc('get_table_constraints', { t_name: 'products' });
  if (error) {
    console.log('RPC failed. Trying to insert known good units to probe...');
    const units = ['kg', 'g', 'l', 'ml', 'pcs', 'Kg', 'G', 'L', 'Ml', 'PCS', 'pieces', 'Pcs'];
    for (const unit of units) {
        const { error: err } = await supabase.from('products').insert({
            name: 'Probe ' + unit,
            price: 0,
            unit: unit
        });
        if (err) {
            console.log(`❌ Unit "${unit}" FAILED: ${err.message}`);
        } else {
            console.log(`✅ Unit "${unit}" SUCCESS`);
            // Cleanup
            await supabase.from('products').delete().eq('name', 'Probe ' + unit);
        }
    }
  } else {
    console.log('Constraints:', data);
  }
}

check();
