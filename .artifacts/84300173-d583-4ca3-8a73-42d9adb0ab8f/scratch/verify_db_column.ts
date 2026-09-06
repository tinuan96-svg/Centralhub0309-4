import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Checking for 'ai_used' column in 'competitor_catalog_items'...");

  const { data, error } = await supabase
    .from('competitor_catalog_items')
    .select('ai_used')
    .limit(1);

  if (error) {
    console.error("❌ Column check failed:", error.message);
    if (error.message.includes("column \"ai_used\" does not exist")) {
        console.log("CRITICAL: The column definitely does not exist in the database.");
    }
  } else {
    console.log("✅ Column 'ai_used' exists in the database.");
  }
}

run();
