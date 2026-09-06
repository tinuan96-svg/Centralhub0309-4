import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string; name: string; code?: string; contact_name?: string; contact_email?: string; contact_phone?: string; email?: string; phone?: string; address?: string; city?: string; country?: string; payment_terms?: string; currency?: string; is_active: boolean; purchase_days?: string[]; average_delivery_days?: number;
  import_instructions?: { sheet_name?: string; header_row?: number; mapping?: Record<string, string>; special_rules?: Record<string, any> };
  notes?: string; rating?: number; created_at: string;
}

export const supplierService = {
  async getAllSuppliers(activeOnly = true): Promise<Supplier[]> { let query = supabase.from('suppliers').select('*').order('name'); if (activeOnly) query = query.eq('is_active', true); const { data, error } = await query; if (error) { console.error('getAllSuppliers error:', error); return []; } return data ?? []; },
  async getSupplierById(id: string): Promise<Supplier | null> { const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle(); if (error) { console.error('getSupplierById error:', error); return null; } return data; },
  async createSupplier(supplier: Partial<Supplier>): Promise<{ data: Supplier | null; error?: string }> { const { data, error } = await supabase.from('suppliers').insert({ ...supplier, is_active: true }).select().maybeSingle(); if (error) { console.error('createSupplier error:', error); return { data: null, error: error.message }; } return { data }; },
  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<{ success: boolean; error?: string }> { const { id: _, ...updateData } = updates as any; const { data, error } = await supabase.from('suppliers').update(updateData).eq('id', id).select().maybeSingle(); if (error) { console.error('updateSupplier error:', error); return { success: false, error: error.message }; } if (!data) return { success: false, error: 'No rows were updated. Check your RLS permissions.' }; return { success: true }; },
  async deleteSupplier(id: string): Promise<boolean> { const { data, error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id).select().maybeSingle(); if (error || !data) return false; return true; },
};
