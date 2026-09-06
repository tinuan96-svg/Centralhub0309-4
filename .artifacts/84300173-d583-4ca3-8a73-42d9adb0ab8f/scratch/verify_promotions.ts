import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

// Manual copy of logic from simulationService.ts for standalone test
function calculate(params: any) {
    const {
        current_price, cost_price, discount_percent, duration_days,
        inventory_quantity, sales_velocity, min_margin
    } = params;

    const discountAmount = current_price * (discount_percent / 100);
    const promotionalPrice = Math.max(0, current_price - discountAmount);
    const currentUnitProfit = current_price - cost_price;
    const promotionalUnitProfit = promotionalPrice - cost_price;
    const currentMarginPercent = current_price > 0 ? (currentUnitProfit / current_price) * 100 : 0;
    const promotionalMarginPercent = promotionalPrice > 0 ? (promotionalUnitProfit / promotionalPrice) * 100 : 0;

    let requiredVolumeMultiplier = 0;
    if (promotionalUnitProfit > 0) {
        requiredVolumeMultiplier = currentUnitProfit / promotionalUnitProfit;
    } else {
        requiredVolumeMultiplier = 99.9;
    }
    const requiredVolumeUpliftPercent = (requiredVolumeMultiplier - 1) * 100;
    const currentTotalUnits = sales_velocity * duration_days;
    const breakEvenUnits = currentTotalUnits * requiredVolumeMultiplier;
    const projectedDaysOfCover = inventory_quantity > 0 ? inventory_quantity / (sales_velocity * requiredVolumeMultiplier) : 0;

    let classification = 'SAFE';
    if (promotionalPrice <= cost_price) classification = 'DO NOT PROMOTE';
    else if (promotionalMarginPercent < min_margin) classification = 'DO NOT PROMOTE';
    else if (inventory_quantity < breakEvenUnits) classification = 'DO NOT PROMOTE';
    else if (requiredVolumeUpliftPercent > 100) classification = 'HIGH RISK';
    else if (projectedDaysOfCover < duration_days) classification = 'HIGH RISK';
    else if (requiredVolumeUpliftPercent > 30) classification = 'CAUTION';

    return {
        promotionalPrice,
        promotionalMarginPercent,
        requiredVolumeUpliftPercent,
        breakEvenUnits,
        projectedDaysOfCover,
        classification
    };
}

async function run() {
  console.log("=== PROMOTION SIMULATOR VALIDATION ===");

  const cases = [
    {
        name: "Healthy Margin (Safe)",
        params: { current_price: 1.49, cost_price: 0.65, discount_percent: 10, duration_days: 30, inventory_quantity: 100, sales_velocity: 2, min_margin: 8 },
        expected: 'SAFE'
    },
    {
        name: "Below Margin Floor (Reject)",
        params: { current_price: 1.29, cost_price: 1.10, discount_percent: 10, duration_days: 30, inventory_quantity: 50, sales_velocity: 1, min_margin: 15 },
        expected: 'DO NOT PROMOTE'
    },
    {
        name: "Low Inventory (Reject)",
        params: { current_price: 4.99, cost_price: 3.00, discount_percent: 10, duration_days: 30, inventory_quantity: 5, sales_velocity: 3, min_margin: 8 },
        expected: 'DO NOT PROMOTE'
    },
    {
        name: "Below Cost (Reject)",
        params: { current_price: 1.00, cost_price: 1.10, discount_percent: 10, duration_days: 30, inventory_quantity: 100, sales_velocity: 5, min_margin: 8 },
        expected: 'DO NOT PROMOTE'
    },
    {
        name: "High Uplift Required (Caution/High Risk)",
        params: { current_price: 10.0, cost_price: 8.5, discount_percent: 10, duration_days: 30, inventory_quantity: 1000, sales_velocity: 10, min_margin: 5 },
        expected: 'HIGH RISK' // (1.5 / 0.5 = 3x volume = +200% uplift)
    }
  ];

  for (const c of cases) {
      const res = calculate(c.params);
      const ok = res.classification === c.expected;
      console.log(`\nTEST: ${c.name}`);
      console.log(`  Price: ${res.promotionalPrice.toFixed(2)} | Margin: ${res.promotionalMarginPercent.toFixed(1)}%`);
      console.log(`  Uplift: +${res.requiredVolumeUpliftPercent.toFixed(1)}% | BE Units: ${res.breakEvenUnits.toFixed(0)}`);
      console.log(`  Stockout in: ${res.projectedDaysOfCover.toFixed(1)} days`);
      console.log(`  Result: ${res.classification} | ${ok ? 'PASS' : 'FAIL'}`);
  }
}

run();
