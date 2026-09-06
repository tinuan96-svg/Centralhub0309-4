const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.MALLUSPICES_SUPABASE_URL;
const key = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const supabase = createClient(url, key);
  console.log("Checking MalluSpices tables...");

  const { data, error } = await supabase.from('products').select('id').limit(1);
  if (error) {
    console.log("products table error:", error.message);
  } else {
    console.log("products table exists.");
  }

  const { data: raw, error: rawError } = await supabase.from('centralhub_products_raw').select('id').limit(1);
  if (rawError) {
     console.log("centralhub_products_raw table error:", rawError.message);
  } else {
    console.log("centralhub_products_raw table exists.");
  }
}

check();
