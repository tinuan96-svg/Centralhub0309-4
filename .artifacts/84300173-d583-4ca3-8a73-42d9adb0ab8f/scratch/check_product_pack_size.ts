import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: prods } = await supabase
    .from('products')
    .select('name, pack_size')
    .gt('pack_size', 1)
    .limit(5);
  console.log('Products with Pack Size > 1:', prods);
}
check();
