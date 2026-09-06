import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("=== EXECUTING FINANCIAL VALIDATION ===");

  const testIds = [
    '462dd440-fad9-490f-b981-e8611a4b84f1', // Cut Mango Pickle
    'a7cd6d6c-b634-4818-a58e-788c177bc1a0', // Garlic Pickle
    'cc4d7f26-3f0d-41ef-a6a2-1fc6845cb418', // Lime Pickle
    'fe450af8-041b-418b-94ef-ddaf6cd2c615', // Velvet Touch Soap
    '1c5db6ed-9e53-455b-bcd4-08bfa74d83e6'  // Care Soap
  ];

  for (const id of testIds) {
    const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
    const { data: compPrices } = await supabase.from('competitor_prices')
        .select('*')
        .eq('product_id', id)
        .eq('match_status', 'automatic')
        .eq('brand_match', true)
        .eq('size_match', true)
        .eq('product_type_match', true);

    if (!p || !compPrices || compPrices.length === 0) {
        console.log(`Skipping ${id}: Missing data.`);
        continue;
    }

    const cost = Number(p.cost_price);
    const price = Number(p.price);
    const compPrice = Number(compPrices[0].price);
    const minMargin = Number(p.min_margin || 8);

    // Current metrics
    const currentProfit = price - cost;
    const currentMargin = (currentProfit / price) * 100;

    // Recommendation logic (Moderate strategy - median)
    // For single competitor, median = the price
    let suggested = compPrice;

    // Margin Protection
    const profitFloor = cost * (1 + (minMargin / 100));
    let marginProtected = false;
    if (suggested < profitFloor) {
        suggested = profitFloor;
        marginProtected = true;
    }

    suggested = Math.round(suggested * 100) / 100;
    const projProfit = suggested - cost;
    const projMargin = (projProfit / suggested) * 100;
    const diffPct = ((suggested - price) / price) * 100;

    console.log(`\nPRODUCT: ${p.name}`);
    console.log(`  Current Price: £${price.toFixed(2)} | Cost: £${cost.toFixed(2)}`);
    console.log(`  Current Profit: £${currentProfit.toFixed(2)} (${currentMargin.toFixed(1)}%)`);
    console.log(`  Comp Price: £${compPrice.toFixed(2)}`);
    console.log(`  Rec Price: £${suggested.toFixed(2)} ${marginProtected ? '[MARGIN PROTECTED]' : ''}`);
    console.log(`  Proj Profit: £${projProfit.toFixed(2)} (${projMargin.toFixed(1)}%)`);
    console.log(`  Diff: ${diffPct.toFixed(1)}%`);

    // Verify calculations match requirements
    const manualProfit = suggested - cost;
    const manualMargin = (manualProfit / suggested) * 100;
    const ok = Math.abs(projProfit - manualProfit) < 0.01 && Math.abs(projMargin - manualMargin) < 0.1;
    console.log(`  Calculation Check: ${ok ? 'PASS' : 'FAIL'}`);
    if (projMargin < minMargin - 0.01) console.log(`  CRITICAL FAIL: Proj Margin ${projMargin}% < Min Margin ${minMargin}%`);
  }

  // 4. MISSING COST TEST
  console.log("\n--- 4. MISSING COST TEST ---");
  const { data: noCostProds } = await supabase.from('products').select('name, cost_price').eq('cost_price', 0).limit(3);
  noCostProds?.forEach(p => {
    console.log(`Product: ${p.name} | Cost: ${p.cost_price} -> Expected: MISSING COST DATA`);
  });
}

run();
