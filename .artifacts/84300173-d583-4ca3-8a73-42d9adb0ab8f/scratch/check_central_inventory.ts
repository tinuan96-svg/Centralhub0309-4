import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('central_inventory').select('*').limit(1);
  if (error) { console.error(error); return; }
  if (data && data.length > 0) {
    console.log('Columns in central_inventory table:', Object.keys(data[0]));
  } else {
    console.log('No rows in central_inventory.');
  }
}
check();
