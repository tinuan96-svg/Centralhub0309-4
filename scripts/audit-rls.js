const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log("Auditing RLS policies...");
  // Query pg_policy
  const { data, error } = await supabase.rpc('get_policies');
  if (error) {
     console.log("RPC 'get_policies' failed, trying to read from pg_policy directly if possible (unlikely).");
  } else {
    console.log("Policies:", JSON.stringify(data, null, 2));
  }
}

check();
