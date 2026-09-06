import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const product_id = '462dd440-fad9-490f-b981-e8611a4b84f1';
  const competitor_id = 'a59bbee7-fd89-44b5-9fdd-5c8ce4530452';

  const { error } = await supabase.from('competitor_prices').upsert({
    product_id,
    competitor_id,
    price: 2.79,
    match_status: 'automatic',
    brand_match: true,
    size_match: true,
    product_type_match: true,
    scan_status: 'success',
    last_scanned_at: new Date().toISOString()
  });

  if (error) console.error("SEED ERROR:", error);
  else console.log("SEED SUCCESS");
}

run();
