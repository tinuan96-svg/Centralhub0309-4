import { supabase } from '@/lib/supabase';

export interface AuditSummary {
  totalAudits: number;
  totalGained: number;
  totalLost: number;
  netChange: number;
  lastAuditDate: string | null;
  affectedProductsCount: number;
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
}

export class AuditReportService {
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
        products (name, sku)
      `)
      .eq('type', 'AUDIT')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AuditReportService] Error fetching trail:', error);
      return [];
    }

    return (data || []).map((log: any) => ({
      id: log.id,
      product_id: log.product_id,
      product_name: log.products?.name || 'Unknown Product',
      sku: log.products?.sku || null,
      old_quantity: log.old_quantity || 0,
      new_quantity: log.new_quantity || 0,
      change: log.change || 0,
      notes: log.notes,
      created_at: log.created_at,
      edited_by_name: 'Staff' // Metadata not always available in logs
    }));
  }
}
