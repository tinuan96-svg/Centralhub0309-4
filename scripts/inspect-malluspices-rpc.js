const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.MALLUSPICES_SUPABASE_URL;
const key = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const supabase = createClient(url, key);
  console.log("Inspecting MalluSpices RPC apply_centralhub_product_event...");

  try {
     const response = await fetch(url + '/rest/v1/', {
       headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
     });
     const spec = await response.json();
     // In OpenAPI spec, RPCs are under paths
     const rpcPath = spec.paths['/rpc/apply_centralhub_product_event'];
     console.log("RPC definition:", JSON.stringify(rpcPath, null, 2));
  } catch (error) {
    console.error("Error fetching MalluSpices spec:", error.message);
  }
}

check();
