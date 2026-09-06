import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string;
  name: string;
  code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  payment_terms?: string;
  currency?: string;
  is_active: boolean;
  purchase_days?: string[];
  average_delivery_days?: number;
  import_instructions?: {
    sheet_name?: string;
    header_row?: number;
    mapping?: Record<string, string>;
    special_rules?: Record<string, any>;
  };
  notes?: string;
  rating?: number;
  created_at: string;
}

type SupplierNameRow = Pick<Supplier, 'id' | 'name'>;

// Keep this deliberately aligned with public.normalize_supplier_name(text) in Supabase.
// The database unique index is still the final safety net; this client-side check gives
// the admin a useful error instead of leaking a raw unique-constraint message.
export function normalizeSupplierName(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\benterprises\b/g, 'enterprise')
    .replace(/\b(limited|ltd)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function findEquivalentActiveSupplier(
  name: string,
  excludeId?: string,
): Promise<{ duplicate: SupplierNameRow | null; error?: string }> {
  const normalized = normalizeSupplierName(name);
  if (!normalized) return { duplicate: null, error: 'Supplier name is required.' };

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('is_active', true);

  if (error) {
    console.error('findEquivalentActiveSupplier error:', error);
    return { duplicate: null, error: error.message };
  }

  const duplicate = ((data || []) as SupplierNameRow[]).find(
    (row) => row.id !== excludeId && normalizeSupplierName(row.name) === normalized,
  );

  return { duplicate: duplicate || null };
}

function duplicateMessage(existingName?: string): string {
  return existingName
    ? `An active supplier named “${existingName}” already exists. Ltd/Limited, &/and and Enterprise/Enterprises variants are treated as the same supplier.`
    : 'An equivalent active supplier already exists. Ltd/Limited, &/and and Enterprise/Enterprises variants are treated as the same supplier.';
}

function friendlySupplierError(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return duplicateMessage();
  return error.message || 'Unable to save supplier.';
}

export const supplierService = {
  async getAllSuppliers(activeOnly = true): Promise<Supplier[]> {
    let query = supabase.from('suppliers').select('*').order('name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) {
      console.error('getAllSuppliers error:', error);
      return [];
    }
    return data ?? [];
  },

  async getSupplierById(id: string): Promise<Supplier | null> {
    const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('getSupplierById error:', error);
      return null;
    }
    return data;
  },

  async createSupplier(supplier: Partial<Supplier>): Promise<{ data: Supplier | null; error?: string }> {
    const name = supplier.name?.trim();
    if (!name) return { data: null, error: 'Supplier name is required.' };

    const check = await findEquivalentActiveSupplier(name);
    if (check.error) return { data: null, error: check.error };
    if (check.duplicate) return { data: null, error: duplicateMessage(check.duplicate.name) };

    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...supplier, name, is_active: true })
      .select()
      .maybeSingle();

    if (error) {
      console.error('createSupplier error:', error);
      return { data: null, error: friendlySupplierError(error) };
    }
    return { data };
  },

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<{ success: boolean; error?: string }> {
    const current = await this.getSupplierById(id);
    if (!current) return { success: false, error: 'Supplier could not be found.' };

    const nextName = (updates.name ?? current.name).trim();
    const nextActive = updates.is_active ?? current.is_active;
    if (!nextName) return { success: false, error: 'Supplier name is required.' };

    if (nextActive) {
      const check = await findEquivalentActiveSupplier(nextName, id);
      if (check.error) return { success: false, error: check.error };
      if (check.duplicate) return { success: false, error: duplicateMessage(check.duplicate.name) };
    }

    const { id: _, ...updateData } = updates as any;
    if (updates.name !== undefined) updateData.name = nextName;

    const { data, error } = await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('updateSupplier error:', error);
      return { success: false, error: friendlySupplierError(error) };
    }
    if (!data) return { success: false, error: 'No rows were updated. Check your RLS permissions.' };
    return { success: true };
  },

  async deleteSupplier(id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error || !data) return false;
    return true;
  },
};
