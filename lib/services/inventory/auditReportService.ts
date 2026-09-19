import { supabase } from '@/lib/supabase';

export interface AuditSummary {
  totalAudits: number;
  totalGained: number;
  totalLost: number;
  netChange: number;
  lastAuditDate: string | null;
  affectedProductsCount: number;
}

export interface AuditLocationSnapshot {
  location_code: string;
  stock_quantity: number;
}

export interface AuditLogEntry {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  old_quantity: number;
  new_quantity: number;
  change: number;
  notes: string | null;
  created_at: string;
  edited_by_name: string | null;
  system_locations: AuditLocationSnapshot[];
  audited_locations: AuditLocationSnapshot[];
  system_location_text: string;
  audited_location_text: string;
  location_match: boolean | null;
}

export interface AuditSessionSummary {
  id: string;
  status: string;
  started_at: string;
  finalized_at: string | null;
  snapshot_product_count: number;
  counted_product_count: number;
  missing_product_count: number;
}

export interface AuditException {
  id: string;
  session_id: string;
  product_id: string;
  status: 'missing_pending' | 'confirmed_found' | 'not_found' | 'damaged' | 'expired';
  system_stock_before: number;
  system_stock_at_finalize: number | null;
  physical_count: number | null;
  quarantined_stock: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
  product_name: string;
  sku: string | null;
  brand: string | null;
  warehouse_location: string | null;
  expiry_date: string | null;
}


const normalizeLocations = (value: unknown): AuditLocationSnapshot[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      location_code: String(row?.location_code || '').trim(),
      stock_quantity: Number(row?.stock_quantity || 0),
    }))
    .filter(row => row.location_code)
    .sort((a, b) =>
      a.location_code.localeCompare(b.location_code) ||
      a.stock_quantity - b.stock_quantity
    );
};

const locationText = (rows: AuditLocationSnapshot[]) =>
  rows.length
    ? rows.map(row => `${row.location_code} × ${row.stock_quantity}`).join(' · ')
    : '—';

export class AuditReportService {
  static async getLatestFullAuditSession(): Promise<AuditSessionSummary | null> {
    const { data, error } = await supabase
      .from('inventory_audit_sessions')
      .select('id,status,started_at,finalized_at,snapshot_product_count,counted_product_count,missing_product_count')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[AuditReportService] Error fetching latest full audit:', error);
      return null;
    }
    return data as AuditSessionSummary | null;
  }

  static async getAuditExceptions(limit = 200): Promise<AuditException[]> {
    const { data, error } = await supabase
      .from('inventory_audit_session_items')
      .select(`
        id,session_id,product_id,status,system_stock_before,system_stock_at_finalize,
        physical_count,quarantined_stock,resolution_note,resolved_at,
        products(name,sku,brand,warehouse_location,expiry_date)
      `)
      .in('status', ['missing_pending','confirmed_found','not_found','damaged','expired'])
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AuditReportService] Error fetching audit exceptions:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      session_id: row.session_id,
      product_id: row.product_id,
      status: row.status,
      system_stock_before: Number(row.system_stock_before || 0),
      system_stock_at_finalize: row.system_stock_at_finalize == null ? null : Number(row.system_stock_at_finalize),
      physical_count: row.physical_count == null ? null : Number(row.physical_count),
      quarantined_stock: row.quarantined_stock == null ? null : Number(row.quarantined_stock),
      resolution_note: row.resolution_note || null,
      resolved_at: row.resolved_at || null,
      product_name: row.products?.name || 'Unknown Product',
      sku: row.products?.sku || null,
      brand: row.products?.brand || null,
      warehouse_location: row.products?.warehouse_location || null,
      expiry_date: row.products?.expiry_date || null,
    }));
  }

  static async resolveAuditException(
    itemId: string,
    resolution: 'found' | 'not_found' | 'damaged' | 'expired',
    confirmedStock?: number,
    note?: string,
  ): Promise<boolean> {
    const { error } = await supabase.rpc('resolve_inventory_audit_exception', {
      p_item_id: itemId,
      p_resolution: resolution,
      p_confirmed_stock: confirmedStock ?? null,
      p_note: note?.trim() || null,
    });
    if (error) {
      console.error('[AuditReportService] Failed to resolve audit exception:', error);
      return false;
    }
    return true;
  }

  static async getAuditSummary(days: number = 30): Promise<AuditSummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('inventory_logs')
      .select('change')
      .eq('type', 'AUDIT')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('[AuditReportService] Error fetching summary:', error);
      return { totalAudits: 0, totalGained: 0, totalLost: 0, netChange: 0, lastAuditDate: null, affectedProductsCount: 0 };
    }

    let gained = 0;
    let lost = 0;
    data?.forEach(log => {
      if (log.change > 0) gained += log.change;
      else if (log.change < 0) lost += Math.abs(log.change);
    });

    const { count: affectedCount } = await supabase
      .from('inventory_logs')
      .select('product_id', { count: 'exact', head: true })
      .eq('type', 'AUDIT')
      .gte('created_at', startDate.toISOString());

    const { data: lastAudit } = await supabase
      .from('inventory_logs')
      .select('created_at')
      .eq('type', 'AUDIT')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      totalAudits: data?.length || 0,
      totalGained: gained,
      totalLost: lost,
      netChange: gained - lost,
      lastAuditDate: lastAudit?.created_at || null,
      affectedProductsCount: affectedCount || 0
    };
  }

  static async getAuditTrail(limit: number = 50): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select(`
        id, product_id, change, old_quantity, new_quantity, notes, created_at,
        system_locations, audited_locations,
        products (name, sku)
      `)
      .eq('type', 'AUDIT')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AuditReportService] Error fetching trail:', error);
      return [];
    }

    return (data || []).map((log: any) => {
      const systemLocations = normalizeLocations(log.system_locations);
      const auditedLocations = normalizeLocations(log.audited_locations);
      const hasLocationSnapshot = systemLocations.length > 0 || auditedLocations.length > 0;

      return {
        id: log.id,
        product_id: log.product_id,
        product_name: log.products?.name || 'Unknown Product',
        sku: log.products?.sku || null,
        old_quantity: log.old_quantity || 0,
        new_quantity: log.new_quantity || 0,
        change: log.change || 0,
        notes: log.notes,
        created_at: log.created_at,
        edited_by_name: 'Staff',
        system_locations: systemLocations,
        audited_locations: auditedLocations,
        system_location_text: locationText(systemLocations),
        audited_location_text: locationText(auditedLocations),
        location_match: hasLocationSnapshot
          ? JSON.stringify(systemLocations) === JSON.stringify(auditedLocations)
          : null,
      };
    });
  }
}
