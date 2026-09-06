import { CompetitorPrice } from '../competitorService';

export interface VerificationCriteria {
  minConfidence: number;
  requireBrandMatch: boolean;
  requireSizeMatch: boolean;
  requireProductTypeMatch: boolean;
  maxAgeHours: number;
}

const DEFAULT_CRITERIA: VerificationCriteria = {
  minConfidence: 80,
  requireBrandMatch: true,
  requireSizeMatch: true,
  requireProductTypeMatch: true,
  maxAgeHours: 72,
};

export class CompetitorVerificationService {
  /**
   * Filters and validates competitor prices based on canonical business rules.
   */
  static getVerifiedMarketData(
    prices: CompetitorPrice[],
    criteria: Partial<VerificationCriteria> = {}
  ) {
    const config = { ...DEFAULT_CRITERIA, ...criteria };
    const now = Date.now();

    const verified = prices.filter(p => {
      // 1. Identity Verification
      const hasConfidence = (p.match_confidence || 0) >= config.minConfidence;
      const brandValid = !config.requireBrandMatch || p.brand_match === true;
      const sizeValid = !config.requireSizeMatch || p.size_match === true;
      const typeValid = !config.requireProductTypeMatch || p.product_type_match === true;

      // 2. Freshness Check
      const scanTime = p.last_scanned_at ? new Date(p.last_scanned_at).getTime() : 0;
      const ageHours = (now - scanTime) / (1000 * 60 * 60);
      const isFresh = ageHours <= config.maxAgeHours;

      // 3. Quality Checks
      const isSuccess = p.scan_status === 'success';
      const isNotConditional = !p.is_conditional;

      return (
        hasConfidence &&
        brandValid &&
        sizeValid &&
        typeValid &&
        isFresh &&
        isSuccess &&
        isNotConditional
      );
    });

    if (verified.length === 0) return null;

    const sortedPrices = verified
      .map(p => Number(p.price) + Number(p.shipping_fee || 0))
      .sort((a, b) => a - b);

    const lowest = sortedPrices[0];
    const highest = sortedPrices[sortedPrices.length - 1];
    const avg = sortedPrices.reduce((s, p) => s + p, 0) / sortedPrices.length;
    const median = sortedPrices.length % 2 === 0
      ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
      : sortedPrices[Math.floor(sortedPrices.length / 2)];

    return {
      verified_count: verified.length,
      lowest,
      highest,
      average: avg,
      median,
      verified_competitors: verified,
      stale_count: prices.length - verified.length
    };
  }
}
