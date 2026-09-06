import { DHLRateCalculatorService, DHLCalculationInput } from '../lib/services/shipping/dhlRateCalculatorService';

// Mock Date to bypass "new Date()" dynamic value in service if needed,
// though we pass it in the input.

function test() {
  console.log('--- DHL Cost Calculator Phase 2 Integration Test ---');

  // Test Case 1: Shipment BEFORE 26 January 2026 (Historical Rate Protection)
  const inputV1: DHLCalculationInput = {
    shipmentDate: new Date('2026-01-20'),
    zone: 'A',
    numParcels: 1,
    weightPerParcel: 10,
    dimensions: { length: 30, width: 30, height: 30 },
    timedService: 'none',
    isIsleOfWight: false,
    isCongestionZone: false,
    isBagIt: false
  };
  const resV1 = DHLRateCalculatorService.calculate(inputV1);
  console.log('\n[Test 1] Historical Rate (Zone A, Jan 20):');
  console.log(`- Rate Version: ${resV1.rateVersion}`);
  console.log(`- Base Cost: £${resV1.baseCost.toFixed(2)} (Expected: £4.44)`);
  console.log(`- Total Cost: £${resV1.totalEstimatedCost.toFixed(2)}`);

  // Test Case 2: Shipment AFTER 26 January 2026 (GPI 8.5% Applied)
  const inputV2: DHLCalculationInput = {
    ...inputV1,
    shipmentDate: new Date('2026-01-30')
  };
  const resV2 = DHLRateCalculatorService.calculate(inputV2);
  console.log('\n[Test 2] New Rate with 8.5% GPI (Zone A, Jan 30):');
  console.log(`- Rate Version: ${resV2.rateVersion}`);
  console.log(`- Base Cost: £${resV2.baseCost.toFixed(2)} (Expected: £4.82)`); // 4.44 * 1.085 = 4.8174 -> 4.82
  console.log(`- Total Cost: £${resV2.totalEstimatedCost.toFixed(2)}`);

  // Test Case 3: Long Length Ranges (Phase 2 Specific Values)
  console.log('\n[Test 3] Phase 2 Long Length Surcharges (Jan 30):');
  const ranges = [
    { length: 125, expected: 5.00 },
    { length: 145, expected: 7.50 },
    { length: 165, expected: 10.00 },
    { length: 185, expected: 15.00 }
  ];

  ranges.forEach(({ length, expected }) => {
    const res = DHLRateCalculatorService.calculate({
      ...inputV2,
      dimensions: { length, width: 30, height: 30 }
    });
    console.log(`- Side: ${length}cm -> Surcharge: £${res.longLengthSurcharge.toFixed(2)} (Expected: £${expected.toFixed(2)})`);
  });

  // Test Case 4: Heavyweight Surcharge (8.5% increase applied to v1)
  console.log('\n[Test 4] Heavyweight Surcharges with 8.5% GPI (Jan 30):');
  const weights = [
    { weight: 31, v1: 10.00, expected: 10.85 },
    { weight: 35, v1: 30.00, expected: 32.55 }
  ];

  weights.forEach(({ weight, v1, expected }) => {
    const res = DHLRateCalculatorService.calculate({
      ...inputV2,
      weightPerParcel: weight
    });
    console.log(`- Weight: ${weight}kg -> Surcharge: £${res.heavyweightSurcharge.toFixed(2)} (Expected: £${expected.toFixed(2)})`);
  });

  // Test Case 5: Out of Gauge Surcharge (Jan 30)
  const inputOOG: DHLCalculationInput = {
    ...inputV2,
    dimensions: { length: 85, width: 85, height: 30 }
  };
  const resOOG = DHLRateCalculatorService.calculate(inputOOG);
  console.log('\n[Test 5] Out of Gauge (2 sides >= 80cm) with 8.5% GPI (Jan 30):');
  console.log(`- Surcharge: £${resOOG.outOfGaugeSurcharge.toFixed(2)} (Expected: £16.28)`); // 15.00 * 1.085 = 16.275 -> 16.28

  console.log('\n--- Integration Tests Complete ---');
}

test();
