import { supabase } from '@/lib/supabase';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  parent_id: string | null;
  show_on_homepage: boolean;
  icon: string | null;
  created_at: string;
  updated_at: string;
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
    if (!category.slug && category.name) {
      category.slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([category])
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      return null;
    }
    return data;
  },

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      return null;
    }
    return data;
  },

  async deleteCategory(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      return false;
    }
    return true;
  }
};
