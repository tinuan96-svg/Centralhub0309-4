const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log("Checking migration history...");
  // Try to query common migration tables
  const { data, error } = await supabase.from('_migrations').select('*');
  if (error) {
    console.log("_migrations failed:", error.message);
  } else {
    console.log("Migrations count:", data.length);
  }

  // Try to query schema_migrations in supabase_migrations schema if we can
  // But we usually can't via PostgREST unless exposed.
}

check();
