import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Checking columns in 'competitor_prices'...");
  const { data, error } = await supabase
    .from('competitor_prices')
    .select('match_method, brand_match, size_match, product_type_match, ai_used, ai_model')
    .limit(1);

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Columns exist.");
  }
}

run();
