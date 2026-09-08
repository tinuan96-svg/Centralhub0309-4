import { supabase } from '@/lib/supabase';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  website?: string | null;
  is_active: boolean;
  show_on_homepage?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function cleanBrandPayload(brand: Partial<Brand>) {
  const payload: Partial<Brand> = { ...brand };
  if (payload.name) payload.name = payload.name.trim();
  if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
  if (payload.slug) payload.slug = slugify(payload.slug);
  if (payload.description !== undefined) payload.description = payload.description ? String(payload.description).trim() : null;
  if (payload.website !== undefined) payload.website = payload.website ? String(payload.website).trim() : null;
  if (payload.logo_url !== undefined) payload.logo_url = payload.logo_url ? String(payload.logo_url).trim() : null;
  payload.updated_at = new Date().toISOString();
  return payload;
}

export const brandService = {
  async getAllBrands(): Promise<Brand[]> {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('sort_order', { ascending: true })
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
    const payload = cleanBrandPayload({ is_active: true, show_on_homepage: false, sort_order: 0, ...brand });
    if (!payload.name) throw new Error('Brand name is required');
    if (!payload.slug) throw new Error('Brand slug is required');

    const { data, error } = await supabase
      .from('brands')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating brand:', error);
      throw error;
    }
    return data;
  },

  async updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | null> {
    const payload = cleanBrandPayload(updates);
    const { data, error } = await supabase
      .from('brands')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating brand:', error);
      throw error;
    }
    return data;
  },

  async deleteBrand(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('brands')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error archiving brand:', error);
      return false;
    }
    return true;
  }
};
