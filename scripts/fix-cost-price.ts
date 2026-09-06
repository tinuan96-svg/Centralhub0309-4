import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Checking if cost_price column exists...");

  // Try a valid numeric insert
  const { error: err } = await supabase.from('products').insert({
    name: 'Probe Cost',
    price: 1,
    cost_price: 0.5
  });

  if (err) {
    if (err.message.includes('column "cost_price" does not exist') || err.message.includes('Could not find')) {
      console.log("❌ cost_price does NOT exist. Adding it now...");
      // We can't add it via postgrest. We must tell the user to run SQL.
    } else {
      console.log("✅ cost_price exists (or failed for other reasons):", err.message);
    }
  } else {
    console.log("✅ cost_price exists and is working!");
    await supabase.from('products').delete().eq('name', 'Probe Cost');
  }
}

run();
