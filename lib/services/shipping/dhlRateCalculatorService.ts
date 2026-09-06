import { DHLRateVersion, getDHLRatesForDate } from '../../constants/dhlRates';

export interface DHLParcelInput {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface DHLCalculationInput {
  shipmentDate: Date;
  zone: 'A' | 'B' | 'C' | 'D';
  parcels: DHLParcelInput[];
  timedService: 'none' | 'noon' | 'tenThirty' | 'nineAm' | 'saturday' | 'saturdayTenThirty' | 'saturdayNineAm';
  isIsleOfWight: boolean;
  isCongestionZone: boolean;
}

export interface ParcelBreakdown {
  index: number;
  weightKg: number;
  baseCost: number;
  overWeightCharge: number;
  heavyweightSurcharge: number;
  longLengthSurcharge: number;
  outOfGaugeSurcharge: number;
  totalNet: number;
}

export interface DHLCalculationResult {
  parcels: ParcelBreakdown[];
  totalBaseCost: number;
  totalOverWeightCharge: number;
  totalHeavyweightSurcharge: number;
  totalLongLengthSurcharge: number;
  totalOutOfGaugeSurcharge: number;
  timedServiceCharge: number;
  otherCharges: number;
  netSubtotal: number;
  fuelSurcharge: number;
  totalEstimatedCost: number;
  rateVersion: string;
}

export class DHLRateCalculatorService {
  /**
   * Main calculation logic for multi-parcel DHL shipments
   */
  static calculate(input: DHLCalculationInput): DHLCalculationResult {
    const rates = getDHLRatesForDate(input.shipmentDate);
    const zoneKey = `zone${input.zone}` as keyof typeof rates.baseRates;

    const parcelsBreakdown: ParcelBreakdown[] = input.parcels.map((parcel, idx) => {
      // 1. Base Rate (1st vs Subsequent)
      const baseCost = idx === 0 ? rates.baseRates[zoneKey] : rates.subsequentRates[zoneKey];

      // 2. Over 30kg Per-Kilo Charge
      let overWeightCharge = 0;
      if (parcel.weightKg > 30) {
        const extraWeight = parcel.weightKg - 30;
        overWeightCharge = extraWeight * rates.over30kgRate[zoneKey];
      }

      // 3. Heavyweight Surcharge (Tiered)
      let heavyweightSurcharge = 0;
      if (parcel.weightKg > 30) {
        if (parcel.weightKg <= 32) heavyweightSurcharge = rates.heavyweightSurcharges.range1;
        else if (parcel.weightKg <= 34) heavyweightSurcharge = rates.heavyweightSurcharges.range2;
        else if (parcel.weightKg <= 36) heavyweightSurcharge = rates.heavyweightSurcharges.range3;
        else heavyweightSurcharge = rates.heavyweightSurcharges.range4;
      }

      // 4. Long Length Surcharge (120cm+)
      const maxSide = Math.max(parcel.lengthCm, parcel.widthCm, parcel.heightCm);
      let longLengthSurcharge = 0;
      if (maxSide >= 120) {
        if (maxSide < 140) longLengthSurcharge = rates.longLengthSurcharges.range1;
        else if (maxSide < 160) longLengthSurcharge = rates.longLengthSurcharges.range2;
        else if (maxSide < 180) longLengthSurcharge = rates.longLengthSurcharges.range3;
        else if (maxSide < 200) longLengthSurcharge = rates.longLengthSurcharges.range4;
        else longLengthSurcharge = rates.longLengthSurcharges.rangeMax;
      }

      // 5. Out of Gauge Surcharge (2 sides >= 80cm)
      const sortedSides = [parcel.lengthCm, parcel.widthCm, parcel.heightCm].sort((a, b) => b - a);
      let outOfGaugeSurcharge = 0;
      if (sortedSides[0] >= 80 && sortedSides[1] >= 80) {
        outOfGaugeSurcharge = rates.outOfGaugeSurcharge;
      }

      const totalNet = baseCost + overWeightCharge + heavyweightSurcharge + longLengthSurcharge + outOfGaugeSurcharge;

      return {
        index: idx + 1,
        weightKg: parcel.weightKg,
        baseCost,
        overWeightCharge,
        heavyweightSurcharge,
        longLengthSurcharge,
        outOfGaugeSurcharge,
        totalNet
      };
    });

    // 6. Timed Service Charge (Per Item)
    let timedServiceCharge = 0;
    if (input.timedService !== 'none') {
      timedServiceCharge = rates.timedServices[input.timedService] * input.parcels.length;
    }

    // 7. Other Charges
    let otherCharges = 0;
    if (input.isIsleOfWight) otherCharges += rates.otherCharges.isleOfWight;
    if (input.isCongestionZone) otherCharges += rates.otherCharges.congestionCharge;

    // Totals
    const totalBaseCost = parcelsBreakdown.reduce((sum, p) => sum + p.baseCost, 0);
    const totalOverWeightCharge = parcelsBreakdown.reduce((sum, p) => sum + p.overWeightCharge, 0);
    const totalHeavyweightSurcharge = parcelsBreakdown.reduce((sum, p) => sum + p.heavyweightSurcharge, 0);
    const totalLongLengthSurcharge = parcelsBreakdown.reduce((sum, p) => sum + p.longLengthSurcharge, 0);
    const totalOutOfGaugeSurcharge = parcelsBreakdown.reduce((sum, p) => sum + p.outOfGaugeSurcharge, 0);

    const netSubtotal = parcelsBreakdown.reduce((sum, p) => sum + p.totalNet, 0) + timedServiceCharge + otherCharges;

    // 8. Fuel Surcharge
    const fuelSurcharge = netSubtotal * (rates.fuelSurchargePercentage / 100);

    // Final Total
    const totalEstimatedCost = netSubtotal + fuelSurcharge;

    return {
      parcels: parcelsBreakdown,
      totalBaseCost,
      totalOverWeightCharge,
      totalHeavyweightSurcharge,
      totalLongLengthSurcharge,
      totalOutOfGaugeSurcharge,
      timedServiceCharge,
      otherCharges,
      netSubtotal,
      fuelSurcharge,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
      rateVersion: rates.id
    };
  }

  /**
   * Helper to calculate cost for a single-parcel shipment (legacy support)
   */
  static calculateLegacy(input: {
    shipmentDate: Date;
    zone: 'A' | 'B' | 'C' | 'D';
    numParcels: number;
    weightPerParcel: number;
    dimensions: { length: number; width: number; height: number };
    timedService: any;
    isIsleOfWight: boolean;
    isCongestionZone: boolean;
  }): DHLCalculationResult {
    const parcels: DHLParcelInput[] = Array(input.numParcels).fill({
      weightKg: input.weightPerParcel,
      lengthCm: input.dimensions.length,
      widthCm: input.dimensions.width,
      heightCm: input.dimensions.height
    });

    return this.calculate({
      ...input,
      parcels
    });
  }
}
