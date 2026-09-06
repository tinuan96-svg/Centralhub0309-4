import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase
    .from('store_bank_accounts')
    .select('*');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Bank Accounts:', data);
  }
}

check();
