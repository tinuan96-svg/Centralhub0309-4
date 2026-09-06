import { supabase } from '@/lib/supabase';

export interface IntegrationStatus {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error';
  lastSync?: string;
  errorCount: number;
  latestError?: string;
}

export class IntegrationService {
  static async getHealthStats(): Promise<IntegrationStatus[]> {
    const integrations: IntegrationStatus[] = [];

    try {
      // 1. Order Sync Health
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('inventory_sync_status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      const failedOrderSyncs = recentOrders?.filter(o => o.inventory_sync_status === 'failed').length || 0;

      integrations.push({
        id: 'order-sync',
        name: 'Order Ingestion',
        status: failedOrderSyncs > 5 ? 'error' : failedOrderSyncs > 0 ? 'warning' : 'healthy',
        lastSync: recentOrders?.[0]?.created_at,
        errorCount: failedOrderSyncs,
        latestError: failedOrderSyncs > 0 ? 'Some orders failed to sync inventory' : undefined
      });

      // 2. WhatsApp API Health (Mocked based on recent messages if available)
      const { data: recentMessages } = await supabase
        .from('whatsapp_messages')
        .select('status, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      const failedMessages = recentMessages?.filter(m => m.status === 'failed').length || 0;

      integrations.push({
        id: 'whatsapp',
        name: 'WhatsApp Meta API',
        status: failedMessages > 2 ? 'error' : failedMessages > 0 ? 'warning' : 'healthy',
        lastSync: recentMessages?.[0]?.created_at,
        errorCount: failedMessages,
        latestError: failedMessages > 0 ? 'Outbound message delivery failures detected' : undefined
      });

      // 3. DHL API Health (Based on failed shipments)
      const { data: failedShipments } = await supabase
        .from('shipments')
        .select('error_message, created_at')
        .eq('status', 'failed')
        .limit(1);

      integrations.push({
        id: 'dhl',
        name: 'DHL eCommerce API',
        status: failedShipments && failedShipments.length > 0 ? 'warning' : 'healthy',
        lastSync: undefined,
        errorCount: failedShipments?.length || 0,
        latestError: failedShipments?.[0]?.error_message || undefined
      });

    } catch (e) {
      console.error('[IntegrationService] Error fetching health:', e);
    }

    return integrations;
  }
}
