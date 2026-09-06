import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || '');

async function run() {
  const { data: prods } = await supabase.from('products').select('id').limit(1);
  if (!prods?.length) return;
  const pid = prods[0].id;

  const { error } = await supabase.from('central_inventory').insert({
    product_id: pid,
    stock_quantity: 0
  });
  console.log('Insert error for existing pid:', JSON.stringify(error, null, 2));
}
run();
