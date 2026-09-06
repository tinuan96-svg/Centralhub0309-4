import { supabase } from '@/lib/supabase';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  website?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const brandService = {
  async getAllBrands(): Promise<Brand[]> {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching brands:', error);
      return [];
    }
    return data || [];
  },

  async getBrand(id: string): Promise<Brand | null> {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching brand:', error);
      return null;
    }
    return data;
  },

  async createBrand(brand: Partial<Brand>): Promise<Brand | null> {
    if (!brand.slug && brand.name) {
      brand.slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const { data, error } = await supabase
      .from('brands')
      .insert([brand])
      .select()
      .single();

    if (error) {
      console.error('Error creating brand:', error);
      return null;
    }
    return data;
  },

  async updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | null> {
    const { data, error } = await supabase
      .from('brands')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating brand:', error);
      return null;
    }
    return data;
  },

  async deleteBrand(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('brands')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting brand:', error);
      return false;
    }
    return true;
  }
};
