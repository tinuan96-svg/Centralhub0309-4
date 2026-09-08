import { supabase } from '@/lib/supabase';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  parent_id: string | null;
  show_on_homepage: boolean;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function cleanCategoryPayload(category: Partial<Category>) {
  const payload: Partial<Category> = { ...category };
  if (payload.name) payload.name = payload.name.trim();
  if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
  if (payload.slug) payload.slug = slugify(payload.slug);
  if (payload.description !== undefined) payload.description = payload.description ? String(payload.description).trim() : null;
  payload.updated_at = new Date().toISOString();
  return payload;
}

export const categoryService = {
  async getAllCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
    return data || [];
  },

  async getTopLevelCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .is('parent_id', null)
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) {
      console.error('Error fetching top-level categories:', error);
      return [];
    }
    return data || [];
  },

  async getSubcategories(parentId: string): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .eq('parent_id', parentId)
      .order('sort_order', { ascending: true })
      .order('name');

    if (error) {
      console.error('Error fetching subcategories:', error);
      return [];
    }
    return data || [];
  },

  async getCategory(id: string): Promise<Category | null> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching category:', error);
      return null;
    }
    return data;
  },

  async createCategory(category: Partial<Category>): Promise<Category | null> {
    const payload = cleanCategoryPayload({ is_active: true, show_on_homepage: true, sort_order: 0, ...category });
    if (!payload.name) throw new Error('Category name is required');
    if (!payload.slug) throw new Error('Category slug is required');

    const { data, error } = await supabase
      .from('categories')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      throw error;
    }
    return data;
  },

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
    const payload = cleanCategoryPayload(updates);
    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      throw error;
    }
    return data;
  },

  async deleteCategory(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error archiving category:', error);
      return false;
    }
    return true;
  }
};
