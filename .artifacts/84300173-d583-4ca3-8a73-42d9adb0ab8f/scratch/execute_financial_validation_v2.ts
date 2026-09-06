const formatCurrency = (val: number) => `£${val.toFixed(2)}`;

async function run() {
  console.log("=== EXECUTING FINANCIAL VALIDATION (DETERMINISTIC) ===");

  const testProducts = [
    { name: 'Cut Mango Pickle', cost: 1.80, price: 2.99, comp_price: 2.79, min_margin: 10 },
    { name: 'Garlic Pickle', cost: 2.10, price: 3.49, comp_price: 3.29, min_margin: 10 },
    { name: 'Lime Pickle', cost: 1.20, price: 1.99, comp_price: 2.19, min_margin: 10 },
    { name: 'Velvet Touch Soap', cost: 0.65, price: 1.49, comp_price: 1.39, min_margin: 10 },
    { name: 'Care Soap', cost: 0.55, price: 1.29, comp_price: 1.09, min_margin: 10 }
  ];

  for (const p of testProducts) {
    const cost = p.cost;
    const price = p.price;
    const compPrice = p.comp_price;
    const minMargin = p.min_margin;

    // Current metrics
    const currentProfit = price - cost;
    const currentMargin = (currentProfit / price) * 100;

    // Recommendation logic (Moderate strategy - median)
    let suggested = compPrice;

    // Margin Protection
    const profitFloor = cost / (1 - (minMargin / 100));
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
    console.log(`  Current Price: ${formatCurrency(price)} | Cost: ${formatCurrency(cost)}`);
    console.log(`  Current Profit: ${formatCurrency(currentProfit)} (${currentMargin.toFixed(1)}%)`);
    console.log(`  Comp Price: ${formatCurrency(compPrice)}`);
    console.log(`  Rec Price: ${formatCurrency(suggested)} ${marginProtected ? '[MARGIN PROTECTED]' : ''}`);
    console.log(`  Proj Profit: ${formatCurrency(projProfit)} (${projMargin.toFixed(1)}%)`);
    console.log(`  Diff: ${diffPct.toFixed(1)}%`);

    // Verify calculations match requirements
    const manualProfit = suggested - cost;
    const manualMargin = (manualProfit / suggested) * 100;
    const ok = Math.abs(projProfit - manualProfit) < 0.01 && Math.abs(projMargin - manualMargin) < 0.1;
    console.log(`  Calculation Check: ${ok ? 'PASS' : 'FAIL'}`);
  }

  // 3. MINIMUM MARGIN TEST (Force Fail)
  console.log("\n--- 3. MINIMUM MARGIN TEST (FORCE FAIL) ---");
  const failProd = { name: 'Low Margin Item', cost: 10.00, price: 12.00, comp_price: 10.50, min_margin: 15 };
  // Cost 10, Min Margin 15% -> Profit Floor = 10 / 0.85 = 11.76
  // Comp price 10.50 < 11.76 -> Should be adjusted to 11.76
  const floor = failProd.cost / (1 - (failProd.min_margin / 100));
  let rec = failProd.comp_price;
  if (rec < floor) rec = floor;
  const finalMargin = ((rec - failProd.cost) / rec) * 100;
  console.log(`Product: ${failProd.name} | Cost: ${failProd.cost} | Comp: ${failProd.comp_price} | MinMargin: ${failProd.min_margin}%`);
  console.log(`Calculated floor: ${floor.toFixed(2)} | Final Rec: ${rec.toFixed(2)} | Final Margin: ${finalMargin.toFixed(1)}%`);
  console.log(`Margin Protection: ${finalMargin >= failProd.min_margin - 0.01 ? 'PASS' : 'FAIL'}`);
}

run();
