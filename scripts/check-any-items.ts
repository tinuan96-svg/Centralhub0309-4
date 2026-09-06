import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking for any items...');
  const { data, error, count } = await supabase
    .from('order_items')
    .select('*', { count: 'exact', head: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Total items found: ${count}`);
    console.log('Sample items:', data);
  }
}

check();
