import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || '');

async function run() {
  const { data, error } = await supabase.rpc('get_table_constraints', { t_name: 'central_inventory' });
  console.log('Constraints:', JSON.stringify(data, null, 2));

  const { data: cols } = await supabase.rpc('get_table_columns', { t_name: 'central_inventory' });
  console.log('Columns detail:', JSON.stringify(cols, null, 2));
}
run();
