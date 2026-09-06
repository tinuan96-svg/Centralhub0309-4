import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

async function run() {
  const { data } = await supabase.from('shipments').select('id, shipment_number, shipping_cost').limit(10);
  console.log(JSON.stringify(data, null, 2));
}
run();
