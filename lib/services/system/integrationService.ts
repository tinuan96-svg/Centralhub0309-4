import { supabase } from '@/lib/supabase';

export interface IntegrationStatus {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error';
  lastSync?: string;
  errorCount: number;
  latestError?: string;
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

export class IntegrationService {
  static async getHealthStats(): Promise<IntegrationStatus[]> {
    const integrations: IntegrationStatus[] = [];

    // Order ingestion: use the real CentralHub sync fields and only treat current failures as unhealthy.
    try {
      const { data: recentOrders, error } = await supabase
        .from('orders')
        .select('sync_state,sync_error,last_synced_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const failed = (recentOrders || []).filter(order => order.sync_state === 'failed' || Boolean(order.sync_error));
      const pending = (recentOrders || []).filter(order => order.sync_state === 'pending');
      const latest = recentOrders?.[0];

      integrations.push({
        id: 'order-sync',
        name: 'Order Ingestion',
        status: failed.length > 0 ? 'error' : pending.length > 5 ? 'warning' : 'healthy',
        lastSync: latest?.last_synced_at || latest?.created_at,
        errorCount: failed.length,
        latestError: failed[0]?.sync_error || (pending.length > 5 ? `${pending.length} recent orders are still pending sync` : undefined),
      });
    } catch (error: any) {
      integrations.push({ id: 'order-sync', name: 'Order Ingestion', status: 'error', errorCount: 1, latestError: error?.message || 'Unable to read order sync health' });
    }

    // WhatsApp: historical failures must not leave the dashboard permanently red.
    // Evaluate the last 24 hours and use the newest message as the pulse timestamp.
    try {
      const { data: recentMessages, error } = await supabase
        .from('whatsapp_messages')
        .select('status,created_at')
        .gte('created_at', hoursAgo(24))
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = recentMessages || [];
      const failed = rows.filter(message => message.status === 'failed');
      const successful = rows.filter(message => ['sent', 'delivered', 'read'].includes(String(message.status || '').toLowerCase()));
      const latestFailureAt = failed[0]?.created_at ? new Date(failed[0].created_at).getTime() : 0;
      const latestSuccessAt = successful[0]?.created_at ? new Date(successful[0].created_at).getTime() : 0;
      const unresolvedFailure = failed.length > 0 && latestFailureAt >= latestSuccessAt;

      integrations.push({
        id: 'whatsapp',
        name: 'WhatsApp Meta API',
        status: unresolvedFailure && failed.length > 2 ? 'error' : unresolvedFailure ? 'warning' : 'healthy',
        lastSync: rows[0]?.created_at,
        errorCount: unresolvedFailure ? failed.length : 0,
        latestError: unresolvedFailure ? `${failed.length} WhatsApp delivery failure${failed.length === 1 ? '' : 's'} in the last 24 hours without a newer successful delivery` : undefined,
      });
    } catch (error: any) {
      integrations.push({ id: 'whatsapp', name: 'WhatsApp Meta API', status: 'error', errorCount: 1, latestError: error?.message || 'Unable to read WhatsApp health' });
    }

    // DHL: only current failures count. Old failed shipment records remain useful audit history,
    // but must not keep the live integration indicator in warning forever.
    try {
      const { data: recentShipments, error } = await supabase
        .from('shipments')
        .select('status,error_message,created_at,updated_at')
        .gte('created_at', hoursAgo(24))
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = recentShipments || [];
      const failed = rows.filter(shipment => String(shipment.status || '').toLowerCase() === 'failed');
      const successful = rows.filter(shipment => ['booked', 'created', 'shipped', 'in_transit', 'delivered', 'completed'].includes(String(shipment.status || '').toLowerCase()));
      const latestFailureAt = failed[0]?.updated_at || failed[0]?.created_at;
      const latestSuccessAt = successful[0]?.updated_at || successful[0]?.created_at;
      const unresolvedFailure = Boolean(latestFailureAt) && (!latestSuccessAt || new Date(String(latestFailureAt)).getTime() >= new Date(String(latestSuccessAt)).getTime());

      integrations.push({
        id: 'dhl',
        name: 'DHL eCommerce API',
        status: unresolvedFailure ? 'warning' : 'healthy',
        lastSync: rows[0]?.updated_at || rows[0]?.created_at,
        errorCount: unresolvedFailure ? failed.length : 0,
        latestError: unresolvedFailure ? (failed[0]?.error_message || 'A recent DHL shipment operation failed') : undefined,
      });
    } catch (error: any) {
      integrations.push({ id: 'dhl', name: 'DHL eCommerce API', status: 'error', errorCount: 1, latestError: error?.message || 'Unable to read DHL health' });
    }

    return integrations;
  }
}
