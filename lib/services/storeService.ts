import { supabase } from '../supabase';
import { Store } from '../types';

const STORE_FIELDS = 'id, name, slug, domain, visibility, max_display_stock, bucket_name, created_at';

export class StoreService {
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

  static async createStore(storeData: {
    name: string;
    slug: string;
  }): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .insert([storeData])
      .select()
      .single();

    if (error) {
      console.error('Error creating store:', error);
      throw error;
    }

    return data;
  }

  static async updateStore(
    storeId: string,
    updates: {
      name?: string;
      slug?: string;
      max_display_stock?: number;
    }
  ): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', storeId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating store:', error);
      return null;
    }

    return data;
  }

  static async deleteStore(storeId: string): Promise<boolean> {
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', storeId);

    if (error) {
      console.error('Error deleting store:', error);
      throw error;
    }

    return true;
  }
}
