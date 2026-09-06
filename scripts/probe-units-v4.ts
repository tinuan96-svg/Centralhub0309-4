import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    const units = ['Count', 'Nos', 'Nos.', 'Qty', 'Pkts', 'Packs', 'Pcs'];
    for (const unit of units) {
        const { error: err } = await supabase.from('products').insert({
            name: 'Probe ' + unit,
            price: 1,
            unit: unit
        });
        if (err) {
            if (err.message.includes('check constraint')) {
                console.log(`❌ Unit "${unit}" REJECTED`);
            } else {
                console.log(`✅ Unit "${unit}" PASSED`);
            }
        } else {
            console.log(`✅ Unit "${unit}" SUCCESS`);
            await supabase.from('products').delete().eq('name', 'Probe ' + unit);
        }
    }
}

check();
