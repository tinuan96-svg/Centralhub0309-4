import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

async function run() {
  const { data, error } = await supabase.from('central_inventory').select('*').limit(1);
  if (error) {
    console.error('Error fetching from central_inventory:', error);
  } else {
    console.log('Columns in central_inventory:', Object.keys(data[0] || {}));
  }
}
run();
