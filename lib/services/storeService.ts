import { supabase } from '../supabase';
import { Store } from '../types';

const STORE_FIELDS = 'id, name, slug, domain, visibility, max_display_stock, color, bucket_name, project_ref, api_base_url, created_at';

export type StoreCreateInput = {
  name: string;
  slug: string;
  domain?: string | null;
  visibility?: boolean;
  max_display_stock?: number;
  color?: string | null;
  bucket_name?: string | null;
  project_ref?: string | null;
  api_base_url?: string | null;
};

export class StoreService {
  private static cleanStorePayload(input: StoreCreateInput | Partial<StoreCreateInput>) {
    const name = typeof input.name === 'string' ? input.name.trim() : input.name;
    const slug = typeof input.slug === 'string'
      ? input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : input.slug;

    return {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.domain !== undefined ? { domain: input.domain ? String(input.domain).trim() : null } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility !== false } : {}),
      ...(input.max_display_stock !== undefined ? { max_display_stock: Math.max(0, Number(input.max_display_stock) || 0) } : {}),
      ...(input.color !== undefined ? { color: input.color ? String(input.color).trim() : null } : {}),
      ...(input.bucket_name !== undefined ? { bucket_name: input.bucket_name ? String(input.bucket_name).trim() : null } : {}),
      ...(input.project_ref !== undefined ? { project_ref: input.project_ref ? String(input.project_ref).trim() : null } : {}),
      ...(input.api_base_url !== undefined ? { api_base_url: input.api_base_url ? String(input.api_base_url).trim().replace(/\/$/, '') : null } : {}),
    };
  }

  static async getAllStores(): Promise<Store[]> {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select(STORE_FIELDS)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching stores:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching stores:', error);
      return [];
    }
  }

  static async getStoreById(storeId: string): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .select(STORE_FIELDS)
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching store:', error);
      return null;
    }

    return data;
  }

  static async getStoreBySlug(slug: string): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .select(STORE_FIELDS)
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('Error fetching store:', error);
      return null;
    }

    return data;
  }

  static async createStore(storeData: StoreCreateInput): Promise<Store> {
    const payload = this.cleanStorePayload({
      visibility: true,
      max_display_stock: 50,
      ...storeData,
    });

    if (!payload.name) throw new Error('Store name is required');
    if (!payload.slug) throw new Error('Store slug is required');

    const { data, error } = await supabase
      .from('stores')
      .insert([payload])
      .select(STORE_FIELDS)
      .single();

    if (error) {
      console.error('Error creating store:', error);
      throw error;
    }

    return data;
  }

  static async updateStore(
    storeId: string,
    updates: Partial<StoreCreateInput>
  ): Promise<Store | null> {
    const payload = this.cleanStorePayload(updates);

    const { data, error } = await supabase
      .from('stores')
      .update(payload)
      .eq('id', storeId)
      .select(STORE_FIELDS)
      .maybeSingle();

    if (error) {
      console.error('Error updating store:', error);
      throw error;
    }

    return data;
  }

  /**
   * Store deletion is intentionally not exposed here. CentralHub holds historic
   * orders, finance, analytics and customer records linked to stores. Use the
   * visibility flag to disable a store without destroying historical data.
   */
  static async setStoreVisibility(storeId: string, visibility: boolean): Promise<Store | null> {
    return this.updateStore(storeId, { visibility });
  }
}
