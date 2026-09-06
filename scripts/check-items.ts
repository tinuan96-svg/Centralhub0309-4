import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking order_items without join...');

  // Try to fetch items using a raw query or just select everything
  const { data, error, status } = await supabase
    .from('order_items')
    .select('*')
    .limit(1);

  if (error) {
    console.error(`Status ${status}: ${error.message}`);
    if (status === 404) {
        console.log('Table TRULY does not exist.');
    }
  } else {
    console.log('Table exists! Found item:', data);
  }
}

check();
