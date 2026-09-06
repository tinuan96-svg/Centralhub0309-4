import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Checking for 'confidence_score' column in 'competitor_catalog_items'...");
  const { data, error } = await supabase
    .from('competitor_catalog_items')
    .select('confidence_score')
    .limit(1);

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Column exists. Data:", data);
  }
}

run();
