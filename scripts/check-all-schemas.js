const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Try to query pg_catalog or information_schema via RPC if possible
  // Many Supabase projects have a 'run_sql' or similar for admins
  console.log("Checking for tables across schemas...");

  const { data, error } = await supabase.rpc('get_tables_by_schema');
  if (error) {
    console.log("RPC 'get_tables_by_schema' failed:", error.message);
  } else {
    console.log("Tables by schema:", JSON.stringify(data, null, 2));
  }

  // Alternative: query a table we know might exist but in a different schema if we can guess it
}

check();
