import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const malluSupabase = createClient(
  process.env.MALLUSPICES_SUPABASE_URL!,
  process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Checking MalluSpices orders columns...');
  const { data, error } = await malluSupabase.from('orders').select('*').limit(1);
  if (!error && data && data[0]) {
    console.log('Order Columns:', Object.keys(data[0]));
    console.log('Sample Order:', JSON.stringify(data[0], null, 2));
  } else {
    console.error('Error fetching MalluSpices orders:', error);
  }
}

check();
