// Simplified logic test to verify financial formulas
function calculate(params: any) {
    const {
        current_price, cost_price, discount_percent, duration_days,
        inventory_quantity, sales_velocity, min_margin, competitor_median
    } = params;

    const discountAmount = current_price * (discount_percent / 100);
    const promotionalPrice = Math.round(Math.max(0, current_price - discountAmount) * 100) / 100;
    const currentUnitProfit = current_price - cost_price;
    const promotionalUnitProfit = promotionalPrice - cost_price;
    const promotionalMarginPercent = promotionalPrice > 0 ? (promotionalUnitProfit / promotionalPrice) * 100 : 0;

    let requiredVolumeMultiplier = promotionalUnitProfit > 0 ? currentUnitProfit / promotionalUnitProfit : 99;
    const requiredVolumeUpliftPercent = (requiredVolumeMultiplier - 1) * 100;

    return {
        promotionalPrice,
        promotionalMarginPercent,
        requiredVolumeUpliftPercent
    };
}

const res = calculate({
    current_price: 100,
    cost_price: 50,
    discount_percent: 20,
    duration_days: 10,
    inventory_quantity: 100,
    sales_velocity: 1,
    min_margin: 10
});

console.log('Test Promotion Model:');
console.log('Price:', res.promotionalPrice, 'Expected: 80');
console.log('Margin:', res.promotionalMarginPercent.toFixed(1), 'Expected: 37.5');
console.log('Uplift:', res.requiredVolumeUpliftPercent.toFixed(1), 'Expected: 66.7');

if (res.promotionalPrice === 80 && Math.abs(res.promotionalMarginPercent - 37.5) < 0.1) {
    console.log('✅ LOGIC PASSED');
} else {
    console.log('❌ LOGIC FAILED');
    process.exit(1);
}
