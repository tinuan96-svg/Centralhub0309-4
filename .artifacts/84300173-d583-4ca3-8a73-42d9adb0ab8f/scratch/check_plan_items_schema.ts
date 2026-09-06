import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('backorder_plan_items').select('*').limit(1);
  if (error) { console.error('Error fetching plan items:', error); return; }
  if (data && data.length > 0) {
    console.log('Columns in backorder_plan_items:', Object.keys(data[0]));
  } else {
    console.log('No rows in backorder_plan_items.');
    // Try to get column names from information_schema if possible via RPC or just assume migration worked if no error
  }
}
check();
