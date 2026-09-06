/**
 * DHL eCommerce UK (UK Mail) Contract Rates
 * Source of Truth: Mallu Spices Global Ltd DHL Contract & 2026 GPI Notification
 */

export interface DHLRateVersion {
  id: string;
  effectiveFrom: string;
  baseRates: {
    zoneA: number;
    zoneB: number;
    zoneC: number;
    zoneD: number;
  };
  subsequentRates: {
    zoneA: number;
    zoneB: number;
    zoneC: number;
    zoneD: number;
  };
  over30kgRate: {
    zoneA: number;
    zoneB: number;
    zoneC: number;
    zoneD: number;
  };
  heavyweightSurcharges: {
    range1: number; // 30.01-32kg
    range2: number; // 32.01-34kg
    range3: number; // 34.01-36kg
    range4: number; // 36.01+
  };
  longLengthSurcharges: {
    range1: number; // 120-139.99cm
    range2: number; // 140-159.99cm
    range3: number; // 160-179.99cm
    range4: number; // 180-199.99cm
    rangeMax: number; // 200cm+ (Flag/Unverified)
  };
  outOfGaugeSurcharge: number;
  timedServices: {
    none: number;
    noon: number;
    tenThirty: number;
    nineAm: number;
    saturday: number;
    saturdayTenThirty: number;
    saturdayNineAm: number;
  };
  otherCharges: {
    isleOfWight: number;
    returnToSender: number;
    congestionCharge: number;
    carriageCharge: number;
  };
  fuelSurchargePercentage: number;
}

/**
 * Phase 1 Rates (Pre-GPI)
 * Valid until 25 January 2026
 */
const DHL_RATES_V1: DHLRateVersion = {
  id: 'v1-2025',
  effectiveFrom: '2025-01-01',
  baseRates: {
    zoneA: 4.44,
    zoneB: 4.44,
    zoneC: 10.00,
    zoneD: 12.50
  },
  subsequentRates: {
    zoneA: 3.00,
    zoneB: 3.00,
    zoneC: 8.00,
    zoneD: 8.00
  },
  over30kgRate: {
    zoneA: 0.37, // Estimated from CSV evidence (0.40 / 1.085)
    zoneB: 0.37,
    zoneC: 0.90, // Unverified
    zoneD: 1.10  // Unverified
  },
  heavyweightSurcharges: {
    range1: 9.22, // Estimated (£10 / 1.085)
    range2: 13.82,
    range3: 27.65,
    range4: 36.87
  },
  longLengthSurcharges: {
    range1: 4.61, // Estimated (£5 / 1.085)
    range2: 6.91,
    range3: 9.22,
    range4: 13.82,
    rangeMax: 0
  },
  outOfGaugeSurcharge: 13.82, // Estimated (£15 / 1.085)
  timedServices: {
    none: 0,
    noon: 5.00, // Placeholder
    tenThirty: 10.00, // Placeholder
    nineAm: 15.00, // Placeholder
    saturday: 12.50, // Placeholder
    saturdayTenThirty: 20.00, // Placeholder
    saturdayNineAm: 25.00 // Placeholder
  },
  otherCharges: {
    isleOfWight: 5.00,
    returnToSender: 10.00,
    congestionCharge: 0.75, // Matches CSV evidence (0.81 / 1.085)
    carriageCharge: 0
  },
  fuelSurchargePercentage: 12.00
};

/**
 * Phase 2 Rates (Post-GPI 8.5%)
 * Effective from 26 January 2026
 * LITERAL VALUES calculated once as instructed.
 */
const DHL_RATES_V2: DHLRateVersion = {
  id: 'v2-2026',
  effectiveFrom: '2026-01-26',
  baseRates: {
    zoneA: 4.82, // 4.44 * 1.085 = 4.8174
    zoneB: 4.82,
    zoneC: 10.85,
    zoneD: 13.56
  },
  subsequentRates: {
    zoneA: 3.26, // 3.00 * 1.085 = 3.255
    zoneB: 3.26,
    zoneC: 8.68,
    zoneD: 8.68
  },
  over30kgRate: {
    zoneA: 0.40, // Unverified in text, estimated from CSV
    zoneB: 0.40,
    zoneC: 0.98,
    zoneD: 1.19
  },
  heavyweightSurcharges: {
    range1: 10.00, // Literal from instructions
    range2: 15.00,
    range3: 30.00,
    range4: 40.00
  },
  longLengthSurcharges: {
    range1: 5.00, // 120-139cm
    range2: 7.50, // 140-159cm
    range3: 10.00, // 160-179cm
    range4: 15.00, // 180-199cm
    rangeMax: 15.00 // Unverified for 200cm+, capped at max range
  },
  outOfGaugeSurcharge: 15.00, // Literal from instructions
  timedServices: {
    none: 0,
    noon: 5.43, // 5.00 * 1.085
    tenThirty: 10.85,
    nineAm: 16.28,
    saturday: 13.56,
    saturdayTenThirty: 21.70,
    saturdayNineAm: 27.13
  },
  otherCharges: {
    isleOfWight: 5.43,
    returnToSender: 10.85,
    congestionCharge: 0.81, // Matches CSV evidence
    carriageCharge: 0
  },
  fuelSurchargePercentage: 12.00
};

export const DHL_RATE_VERSIONS = [DHL_RATES_V2, DHL_RATES_V1];

export const getDHLRatesForDate = (date: Date): DHLRateVersion => {
  const version = DHL_RATE_VERSIONS.find(v => new Date(v.effectiveFrom) <= date);
  return version || DHL_RATES_V1;
};
