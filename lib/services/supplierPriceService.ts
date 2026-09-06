import { supabase } from '@/lib/supabase';

export interface ProductSupplierMapping {
  id: string;
  product_id: string;
  supplier_id: string;
  product_name: string;
  supplier_name: string;
  supplier_sku?: string;
  supplier_product_name?: string;
  supplier_barcode?: string;
  supplier_brand?: string;
  cost_price: number;
  case_price?: number;
  unit_price?: number;
  product_type?: string;
  unit_of_measure?: string;
  supplier_comment?: string;
  minimum_order_qty: number;
  lead_time_days: number;
  is_preferred: boolean;
  pack_size: number;
  case_quantity?: number;
  pack_unit: string | null;
  product_stock: number;
  reorder_frequency: string;
  purchase_days?: string[];
  vat_rate?: number;
  is_active: boolean;
}

class SupplierPriceService {
  async getAllMappings(searchTerm?: string): Promise<ProductSupplierMapping[]> {
    let query = supabase.from('product_suppliers').select(`id, product_id, supplier_id, cost_price, minimum_order_qty, lead_time_days, is_preferred, supplier_sku, supplier_product_name, supplier_barcode, supplier_brand, case_price, unit_price, product_type, unit_of_measure, supplier_comment, pack_size, case_quantity, vat_rate, is_active, products!inner(name, stock, pack_size, pack_unit, reorder_frequency), suppliers!inner(name, purchase_days)`).order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) { console.error('getAllMappings error:', error); return []; }
    if (!data) return [];
    let mappings: ProductSupplierMapping[] = data.map((row: any) => ({
      id: row.id, product_id: row.product_id, supplier_id: row.supplier_id,
      product_name: row.products?.name || 'Unknown', supplier_name: row.suppliers?.name || 'Unknown',
      supplier_sku: row.supplier_sku || null, supplier_product_name: row.supplier_product_name || null,
      supplier_barcode: row.supplier_barcode || null, supplier_brand: row.supplier_brand || null,
      case_price: row.case_price || null, unit_price: row.unit_price || null, product_type: row.product_type || null,
      unit_of_measure: row.unit_of_measure || null, supplier_comment: row.supplier_comment || null,
      cost_price: Number(row.cost_price) || 0, minimum_order_qty: row.minimum_order_qty || 1,
      lead_time_days: row.lead_time_days || 0, is_preferred: row.is_preferred || false,
      pack_size: row.pack_size || row.products?.pack_size || 1, case_quantity: row.case_quantity || 1,
      pack_unit: row.products?.pack_unit || null, product_stock: row.products?.stock || 0,
      reorder_frequency: row.products?.reorder_frequency || 'regular', purchase_days: row.suppliers?.purchase_days || [],
      vat_rate: row.vat_rate || 0, is_active: row.is_active !== false,
    }));
    if (searchTerm) { const term = searchTerm.toLowerCase(); mappings = mappings.filter(m => m.product_name.toLowerCase().includes(term) || m.supplier_name.toLowerCase().includes(term)); }
    return mappings;
  }

  async upsertMapping(mapping: { product_id: string; supplier_id: string; cost_price: number; supplier_sku?: string; supplier_product_name?: string; supplier_barcode?: string; supplier_brand?: string; case_price?: number; unit_price?: number; product_type?: string; unit_of_measure?: string; supplier_comment?: string; pack_size?: number; case_quantity?: number; vat_rate?: number; minimum_order_qty?: number; lead_time_days?: number; is_preferred?: boolean; is_active?: boolean; }): Promise<boolean> {
    const { data: existing } = await supabase.from('product_suppliers').select('id').eq('product_id', mapping.product_id).eq('supplier_id', mapping.supplier_id).maybeSingle();
    const payload: any = { ...mapping, pack_size: mapping.pack_size ?? 1, case_quantity: mapping.case_quantity ?? 1, vat_rate: mapping.vat_rate ?? 0, minimum_order_qty: mapping.minimum_order_qty ?? 1, lead_time_days: mapping.lead_time_days ?? 0, is_preferred: mapping.is_preferred ?? false, is_active: mapping.is_active ?? true, updated_at: new Date().toISOString() };
    if (existing) { const { error } = await supabase.from('product_suppliers').update(payload).eq('id', existing.id); if (error) { console.error('upsertMapping update error:', error); return false; } }
    else { const { error } = await supabase.from('product_suppliers').insert(payload); if (error) { console.error('upsertMapping insert error:', error); return false; } }
    if (mapping.is_preferred) { const { data: others } = await supabase.from('product_suppliers').select('id').eq('product_id', mapping.product_id).neq('supplier_id', mapping.supplier_id); if (others?.length) await supabase.from('product_suppliers').update({ is_preferred: false }).in('id', others.map((o: any) => o.id)); }
    return true;
  }

  async deleteMapping(id: string): Promise<boolean> { const { error } = await supabase.from('product_suppliers').delete().eq('id', id); if (error) { console.error('deleteMapping error:', error); return false; } return true; }
  async updateProductPackInfo(productId: string, packSize: number, packUnit: string | null, reorderFrequency: string): Promise<boolean> { const { error } = await supabase.from('products').update({ pack_size: packSize, pack_unit: packUnit, reorder_frequency: reorderFrequency }).eq('id', productId); if (error) { console.error('updateProductPackInfo error:', error); return false; } return true; }
  async getUnmappedProducts(): Promise<{ id: string; name: string; stock: number; pack_size: number }[]> { const { data: products, error } = await supabase.from('products').select('id, name, stock, pack_size').order('name').limit(500); if (error || !products) return []; const { data: mappings } = await supabase.from('product_suppliers').select('product_id'); const mappedIds = new Set((mappings || []).map((m: any) => m.product_id)); return products.filter((p: any) => !mappedIds.has(p.id)).map((p: any) => ({ id: p.id, name: p.name, stock: p.stock, pack_size: p.pack_size })); }
  async getComparisonData(): Promise<any[]> { const { data, error } = await supabase.from('products').select(`id, name, sku, product_suppliers (id, supplier_id, supplier_sku, supplier_product_name, supplier_barcode, cost_price, pack_size, case_quantity, vat_rate, is_active, suppliers (name))`).eq('is_deleted', false).order('name'); if (error) { console.error('getComparisonData error:', error); return []; } return (data || []).map(product => { const suppliers = (product.product_suppliers || []).filter((ps: any) => ps.is_active).map((ps: any) => { const totalUnits = (ps.pack_size || 1) * (ps.case_quantity || 1); return { ...ps, supplier_name: ps.suppliers?.name || 'Unknown', effective_unit_cost: ps.cost_price / totalUnits }; }); const cheapestSupplier = suppliers.length ? suppliers.reduce((prev: any, curr: any) => prev.effective_unit_cost < curr.effective_unit_cost ? prev : curr) : null; return { ...product, suppliers, cheapest_supplier: cheapestSupplier }; }); }
}

export const supplierPriceService = new SupplierPriceService();
