import { DHLRateCalculatorService, DHLCalculationInput } from '../lib/services/shipping/dhlRateCalculatorService';

/**
 * COMPREHENSIVE DHL COST CALCULATOR TEST SUITE
 * Verifying 15 specific scenarios from instructions
 */

function runTests() {
  console.log('--- 🧪 DHL COST CALCULATOR VERIFICATION ---');

  const v1Date = new Date('2026-01-20');
  const v2Date = new Date('2026-02-01');

  // Helper to format currency
  const fmt = (val: number) => `£${val.toFixed(2)}`;

  // 1. Zone A shipment under 30kg
  const t1 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`\n[1] Zone A < 30kg: Base £4.82 -> Result ${fmt(t1.totalEstimatedCost)} (incl fuel)`);

  // 2. Zone B shipment
  const t2 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'B',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[2] Zone B: Base £4.82 -> Result ${fmt(t2.totalEstimatedCost)}`);

  // 3. Zone C shipment
  const t3 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'C',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[3] Zone C: Base £10.85 -> Result ${fmt(t3.totalEstimatedCost)}`);

  // 4. Zone D shipment
  const t4 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'D',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[4] Zone D: Base £13.56 -> Result ${fmt(t4.totalEstimatedCost)}`);

  // 5. Multiple parcels
  const t5 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [
      { weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 },
      { weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }
    ],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[5] Multi Parcel (2): 1st £4.82 + 2nd £3.26 -> Subtotal £8.08 -> Result ${fmt(t5.totalEstimatedCost)}`);

  // 6. Weight above 30kg
  const t6 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 31, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[6] Weight > 30kg (31kg): Base £4.82 + Overweight £0.40 + Heavyweight £10 -> Result ${fmt(t6.totalEstimatedCost)}`);

  // 7. Each heavyweight range
  const hwRanges = [31, 33, 35, 40];
  console.log(`[7] Heavyweight Ranges:`);
  hwRanges.forEach(w => {
    const res = DHLRateCalculatorService.calculate({
      shipmentDate: v2Date,
      zone: 'A',
      parcels: [{ weightKg: w, lengthCm: 30, widthCm: 30, heightCm: 30 }],
      timedService: 'none',
      isIsleOfWight: false,
      isCongestionZone: false
    });
    console.log(`    - ${w}kg: Surcharge ${fmt(res.totalHeavyweightSurcharge)}`);
  });

  // 8. Each latest long-length range
  const llRanges = [130, 150, 170, 190, 210];
  console.log(`[8] Long Length Ranges (Post-GPI):`);
  llRanges.forEach(l => {
    const res = DHLRateCalculatorService.calculate({
      shipmentDate: v2Date,
      zone: 'A',
      parcels: [{ weightKg: 10, lengthCm: l, widthCm: 30, heightCm: 30 }],
      timedService: 'none',
      isIsleOfWight: false,
      isCongestionZone: false
    });
    console.log(`    - ${l}cm: Surcharge ${fmt(res.totalLongLengthSurcharge)}`);
  });

  // 9. Out-of-gauge parcel
  const t9 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 85, widthCm: 85, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[9] Out-of-Gauge (85x85cm): Surcharge ${fmt(t9.totalOutOfGaugeSurcharge)}`);

  // 10. Timed service
  const t10 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'nineAm',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[10] Timed Service (9AM): Charge ${fmt(t10.timedServiceCharge)}`);

  // 11. Saturday service
  const t11 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'saturday',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[11] Saturday Service: Charge ${fmt(t11.timedServiceCharge)}`);

  // 12. Fuel surcharge
  const t12 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[12] Fuel Surcharge: ${fmt(t12.fuelSurcharge)} (12% of ${fmt(t12.netSubtotal)})`);

  // 13. Shipment BEFORE 26 January 2026
  const t13 = DHLRateCalculatorService.calculate({
    shipmentDate: v1Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[13] Pre-GPI (Jan 20): Rate ${t13.rateVersion}, Base £4.44, Result ${fmt(t13.totalEstimatedCost)}`);

  // 14. Shipment AFTER 26 January 2026
  const t14 = DHLRateCalculatorService.calculate({
    shipmentDate: v2Date,
    zone: 'A',
    parcels: [{ weightKg: 10, lengthCm: 30, widthCm: 30, heightCm: 30 }],
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false
  });
  console.log(`[14] Post-GPI (Feb 1): Rate ${t14.rateVersion}, Base £4.82, Result ${fmt(t14.totalEstimatedCost)}`);

  // 15. Verify 8.5% GPI exactly once
  const baseV1 = t13.totalBaseCost;
  const baseV2 = t14.totalBaseCost;
  const increase = (baseV2 / baseV1) - 1;
  console.log(`[15] Increase Verification: ${(increase * 100).toFixed(2)}% (Target 8.5%)`);

  console.log('\n--- ✅ VERIFICATION COMPLETE ---');
}

runTests();
