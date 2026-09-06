const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.MALLUSPICES_SUPABASE_URL;
const key = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  if (!url || !key) {
    console.error("MalluSpices credentials missing");
    return;
  }
  const supabase = createClient(url, key);
  console.log("Inspecting MalluSpices centralhub_products_raw...");

  // Try to get OpenAPI spec of MalluSpices
  try {
     const response = await fetch(url + '/rest/v1/', {
       headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
     });
     const spec = await response.json();
     const table = spec.definitions.centralhub_products_raw;
     console.log("centralhub_products_raw definition:", JSON.stringify(table, null, 2));
  } catch (error) {
    console.error("Error fetching MalluSpices spec:", error.message);
  }
}

check();
