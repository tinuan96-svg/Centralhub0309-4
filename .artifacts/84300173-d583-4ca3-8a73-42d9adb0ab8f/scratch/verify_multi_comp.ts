import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_ID = '462dd440-fad9-490f-b981-e8611a4b84f1';

async function run() {
  console.log("=== MULTI-COMPETITOR CALCULATION VERIFICATION ===");

  const { data: compPrices } = await supabase.from('competitor_prices')
    .select('price')
    .eq('product_id', PRODUCT_ID)
    .eq('match_status', 'automatic')
    .eq('scan_status', 'success');

  if (!compPrices || compPrices.length < 3) {
      console.log("Not enough competitor data found.");
      return;
  }

  const prices = compPrices.map(p => Number(p.price)).sort((a, b) => a - b);
  const lowest = prices[0];
  const highest = prices[prices.length - 1];
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const median = prices.length % 2 === 0
    ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : prices[Math.floor(prices.length / 2)];

  console.log("Prices:", prices.join(', '));
  console.log("Lowest:", lowest);
  console.log("Highest:", highest);
  console.log("Average:", avg.toFixed(2));
  console.log("Median:", median);

  // Requirement Check
  const expectedLowest = 2.79;
  const expectedHighest = 2.99;
  const expectedMedian = 2.89;

  const ok = lowest === expectedLowest && highest === expectedHighest && median === expectedMedian;
  console.log(`\nCalculation Check: ${ok ? 'PASS' : 'FAIL'}`);
}

run();
