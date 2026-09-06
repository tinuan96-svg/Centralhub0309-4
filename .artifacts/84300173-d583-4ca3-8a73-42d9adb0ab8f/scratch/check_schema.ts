import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) {
    console.error('Error fetching product for schema check:', error);
    // Try listing tables
    const { data: tables, error: tErr } = await supabase.rpc('get_tables');
    console.log('Tables in DB:', tables);
    return;
  }
  if (data && data.length > 0) {
    console.log('Columns in products table:', Object.keys(data[0]));
  } else {
    console.log('No products found in table.');
  }
}
check();
