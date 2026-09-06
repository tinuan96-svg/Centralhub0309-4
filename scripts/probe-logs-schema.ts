import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

async function run() {
  const { data: logs, error: logsError } = await supabase.from('inventory_logs').select('*').limit(1);
  console.log('Columns in inventory_logs:', Object.keys(logs?.[0] || {}));

  const { data: moves, error: movesError } = await supabase.from('inventory_movements').select('*').limit(1);
  console.log('Columns in inventory_movements:', Object.keys(moves?.[0] || {}));
}
run();
