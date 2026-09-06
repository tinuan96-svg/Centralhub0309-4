import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Checking RLS on order_items...');

  // Try to fetch one item
  const { data, error } = await supabase.from('order_items').select('id').limit(1);

  if (error) {
    console.error('Error fetching order_items:', error.message);
    if (error.message.includes('permission denied')) {
        console.log('RLS is likely ENABLED and blocking you.');
    } else if (error.message.includes('not found')) {
        console.log('The table actually DOES NOT exist.');
    }
  } else {
    console.log('Success! RLS is either disabled or you have a policy allowing access.');
    console.log('Data count:', data?.length);
  }
}

check();
