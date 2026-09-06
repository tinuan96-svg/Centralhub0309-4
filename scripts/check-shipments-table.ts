import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

async function run() {
  const { data, error } = await supabase.from('shipments').select('*').limit(5);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Shipments:', JSON.stringify(data, null, 2));
  }
}
run();
