import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("=== DATABASE RECONCILIATION STATS ===");

  const { data: items, error } = await supabase.from("competitor_catalog_items").select("*");
  if (error) { console.error(error); return; }

  const total = items.length;
  const matched = items.filter(i => i.matched_product_id).length;
  const suspicious = items.filter(i => i.matched_product_id && (i.confidence_score < 80 || !i.confidence_score || !i.match_method)).length;
  const opportunities = items.filter(i => i.status === 'purchase_opportunity').length;
  const missingAudit = items.filter(i => !i.match_method).length;
  const reviewRequired = items.filter(i => i.match_status === 'review_required').length;

  console.log(`Total items: ${total}`);
  console.log(`Previously matched: ${matched}`);
  console.log(`Suspicious matches: ${suspicious}`);
  console.log(`Reset to review_required: ${reviewRequired}`);
  console.log(`Purchase opportunities: ${opportunities}`);
  console.log(`Missing audit fields: ${missingAudit}`);
}

run();
