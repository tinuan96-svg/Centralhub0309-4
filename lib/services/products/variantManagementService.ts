import { supabase } from '@/lib/supabase';

export interface ProductVariant {
  id?: string;
  product_id: string;
  variant_name?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost_price?: number;
  stock?: number;
  stock_quantity?: number;
  unit_value?: number;
  unit_type?: string;
  vat_rate?: number;
  is_active?: boolean;
  created_at?: string;
}

export class VariantManagementService {
  static async getVariantsByProduct(productId: string): Promise<{ data: ProductVariant[]; error: any }> {
    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('price', { ascending: true });
    return { data: data ?? [], error };
  }

  static async createVariant(variant: Partial<ProductVariant>): Promise<{ data: ProductVariant | null; error: any }> {
    const { data, error } = await supabase
      .from('product_variants')
      .insert({ ...variant, is_active: true })
      .select()
      .maybeSingle();

    // App-level legacy sync removed; database store webhook handles propagation.
    return { data, error };
  }

  static async updateVariant(id: string, updates: Partial<ProductVariant>): Promise<{ error: any }> {
    const { data: variant } = await supabase.from('product_variants').select('product_id').eq('id', id).single();

    const { error } = await supabase.from('product_variants').update(updates).eq('id', id);

    // App-level legacy sync removed; database store webhook handles propagation.
    return { error };
  }

  static async deleteVariant(id: string): Promise<{ error: any }> {
    const { data: variant } = await supabase.from('product_variants').select('product_id').eq('id', id).single();

    const { error } = await supabase.from('product_variants').update({ is_active: false }).eq('id', id);

    // App-level legacy sync removed; database store webhook handles propagation.
    return { error };
  }
}
