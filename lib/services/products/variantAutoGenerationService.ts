import { supabase } from '@/lib/supabase';

export interface GeneratedVariant {
  name: string;
  variant_name: string;
  unit_value: number;
  unit_type: string;
  price: number;
  cost_price: number;
  sku_suffix: string;
  pricePerUnit: number;
  marginPercent: number;
  savings?: number;
}

interface AutoGenConfig {
  productId: string;
  productName: string;
  baseUnitValue: number;
  unitType: string;
  multipliers: number[];
  basePrice: number;
  baseCost: number;
}

function buildVariants(config: AutoGenConfig): GeneratedVariant[] {
  const variants = config.multipliers.map(m => {
    const unitValue = config.baseUnitValue * m;
    const price = parseFloat((config.basePrice * m).toFixed(2));
    const cost = parseFloat((config.baseCost * m).toFixed(2));
    const displayUnit = config.unitType === 'g' && unitValue >= 1000
      ? `${unitValue / 1000}kg`
      : config.unitType === 'ml' && unitValue >= 1000
      ? `${unitValue / 1000}L`
      : `${unitValue}${config.unitType}`;
    const pricePerUnit = unitValue > 0 ? price / unitValue : 0;
    const marginPercent = price > 0 ? ((price - cost) / price) * 100 : 0;
    return {
      name: displayUnit,
      variant_name: displayUnit,
      unit_value: unitValue,
      unit_type: config.unitType,
      price,
      cost_price: cost,
      sku_suffix: displayUnit.toLowerCase().replace(/[^a-z0-9]/g, ''),
      pricePerUnit,
      marginPercent,
    };
  });

  // Calculate savings relative to smallest unit
  const basePpu = variants.length > 0 ? variants[0].pricePerUnit : 0;
  return variants.map((v, i) => ({
    ...v,
    savings: i > 0 && basePpu > 0 ? ((basePpu - v.pricePerUnit) / basePpu) * 100 : undefined,
  }));
}

export class VariantAutoGenerationService {
  static previewGeneratedVariants(config: AutoGenConfig): GeneratedVariant[] {
    return buildVariants(config);
  }

  static async autoGenerateVariants(config: AutoGenConfig): Promise<{ success: boolean; error?: any }> {
    const variants = buildVariants(config);
    const rows = variants.map(v => ({
      product_id: config.productId,
      variant_name: v.variant_name,
      unit_value: v.unit_value,
      unit_type: v.unit_type,
      price: v.price,
      cost_price: v.cost_price,
      is_active: true,
    }));
    const { error } = await supabase.from('product_variants').insert(rows);
    return { success: !error, error };
  }
}
