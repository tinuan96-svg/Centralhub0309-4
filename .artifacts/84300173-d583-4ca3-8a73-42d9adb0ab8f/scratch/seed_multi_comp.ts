import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_ID = '462dd440-fad9-490f-b981-e8611a4b84f1'; // Cut Mango Pickle
const COMPS = [
    { id: 'a59bbee7-fd89-44b5-9fdd-5c8ce4530452', price: 2.79 }, // KeralaTaste
    { id: '31ce5697-eec7-4699-a428-6e1e4759358f', price: 2.89 }, // Pickeasy
    { id: 'fd330808-4c32-4a60-ba17-c58fef0975dd', price: 2.99 }  // Veenas
];

async function run() {
  console.log("=== SEEDING MULTI-COMPETITOR DATA ===");

  for (const c of COMPS) {
    await supabase.from('competitor_prices').upsert({
      product_id: PRODUCT_ID,
      competitor_id: c.id,
      price: c.price,
      match_status: 'automatic',
      brand_match: true,
      size_match: true,
      product_type_match: true,
      scan_status: 'success',
      last_scanned_at: new Date().toISOString(),
    }, { onConflict: 'product_id,competitor_id' });
  }

  console.log("Seed complete.");
}

run();
