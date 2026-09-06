import { supabase } from '@/lib/supabase';

interface VariantPricingResult {
  pricePerUnit: { displayText: string; value: number };
  marginPercent: number;
  savingsPercent?: number;
}

export class VariantPricingService {
  static async getStoreVariantPrice(variantId: string, storeId: string): Promise<number | null> {
    const { data } = await supabase
      .from('store_product_variants')
      .select('price')
      .eq('variant_id', variantId)
      .eq('store_id', storeId)
      .maybeSingle();
    return data?.price ?? null;
  }

  static calculateVariantPricing(variant: { price: number; cost_price?: number; unit_value?: number; unit_type?: string }, _baseVariant?: any): VariantPricingResult {
    const margin = variant.cost_price && variant.cost_price > 0
      ? ((variant.price - variant.cost_price) / variant.price) * 100
      : 0;
    let perUnitText = '';
    if (variant.unit_value && variant.unit_value > 0) {
      const ppu = variant.price / variant.unit_value;
      perUnitText = `£${ppu.toFixed(3)}/${variant.unit_type ?? 'unit'}`;
    }
    return {
      pricePerUnit: { displayText: perUnitText, value: variant.unit_value ? variant.price / variant.unit_value : 0 },
      marginPercent: margin,
    };
  }

  static calculateBestValue(variants: Array<{ id?: string; price: number; unit_value?: number }>): string | null {
    return this.findBestValue(variants);
  }

  static findBestValue(variants: Array<{ id?: string; price: number; unit_value?: number }>): string | null {
    const withUnit = variants.filter(v => v.unit_value && v.unit_value > 0);
    if (withUnit.length < 2) return null;
    let bestId: string | null = null;
    let bestPricePerUnit = Infinity;
    for (const v of withUnit) {
      const ppu = v.price / v.unit_value!;
      if (ppu < bestPricePerUnit) { bestPricePerUnit = ppu; bestId = v.id ?? null; }
    }
    return bestId;
  }
}
