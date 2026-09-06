import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('--- SUPPLIER CONSTRAINTS CHECK ---');

  const { data: sups } = await supabase
    .from('product_suppliers')
    .select('product_id, minimum_order_qty, pack_size, cost_price, products(name)')
    .or('minimum_order_qty.gt.1,pack_size.gt.1')
    .limit(5);

  if (!sups || sups.length === 0) { console.log('No products found with MOQ > 1 or Pack Size > 1.'); return; }

  for (const s of sups) {
    const pName = (s.products as any)?.name;
    const moq = s.minimum_order_qty || 1;
    const ps = s.pack_size || 1;

    // Test calculation: Required = 1
    const req = 1;
    let rec = Math.max(req, moq);
    rec = Math.ceil(rec / ps) * ps;

    console.log(`\nProduct: ${pName}`);
    console.log(`  MOQ: ${moq}, Pack Size: ${ps}`);
    console.log(`  Scenario: Need 1 unit`);
    console.log(`  Recommended: ${rec}`);

    // Test calculation: Required = moq + 1
    const req2 = moq + 1;
    let rec2 = Math.max(req2, moq);
    rec2 = Math.ceil(rec2 / ps) * ps;
    console.log(`  Scenario: Need ${req2} units`);
    console.log(`  Recommended: ${rec2}`);
  }
}
check();
