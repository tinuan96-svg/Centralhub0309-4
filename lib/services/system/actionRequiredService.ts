import { supabase } from '@/lib/supabase';

export interface ActionAlert {
  id: string;
  type: 'inventory' | 'order' | 'shipping' | 'payment' | 'integration';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  subtitle: string;
  count: number;
  actionUrl: string;
  actionLabel: string;
}

export class ActionRequiredService {
  static async getActionAlerts(storeId?: string): Promise<ActionAlert[]> {
    const alerts: ActionAlert[] = [];

    try {
      const [outOfStock, lowStock] = await Promise.all([
        supabase.from('central_inventory').select('*', { count: 'exact', head: true }).lte('stock_quantity', 0),
        supabase.from('central_inventory').select('*', { count: 'exact', head: true }).lte('stock_quantity', 5).gt('stock_quantity', 0)
      ]);

      if (outOfStock.count && outOfStock.count > 0) alerts.push({ id: 'inv-out', type: 'inventory', severity: 'critical', title: `${outOfStock.count} Products Out of Stock`, subtitle: 'Urgent replenishment required', count: outOfStock.count, actionUrl: '/inventory?filter=out', actionLabel: 'View Products' });
      if (lowStock.count && lowStock.count > 0) alerts.push({ id: 'inv-low', type: 'inventory', severity: 'warning', title: `${lowStock.count} Products Low in Stock`, subtitle: 'Stock levels below threshold', count: lowStock.count, actionUrl: '/inventory?filter=low', actionLabel: 'View Products' });

      // Fulfilment actions on the business dashboard must be payment-received orders only.
      let ordersQuery = supabase.from('orders').select('id,order_status,created_at').eq('payment_status', 'paid').eq('is_deleted', false).not('order_status', 'in', '("cancelled","refunded","failed")').in('order_status', ['confirmed', 'picking', 'packing']);
      if (storeId && storeId !== 'all') ordersQuery = ordersQuery.eq('store_id', storeId);
      const { data: activeOrders } = await ordersQuery;
      const awaitingPacking = activeOrders?.filter(o => o.order_status === 'confirmed').length || 0;
      if (awaitingPacking > 0) alerts.push({ id: 'order-packing', type: 'order', severity: 'info', title: `${awaitingPacking} Paid Orders Awaiting Packing`, subtitle: 'Payment received · ready to process', count: awaitingPacking, actionUrl: '/packing', actionLabel: 'Open Packing' });

      // Failed-shipment alerts are also restricted to valid paid orders.
      const { data: failedShipmentRows } = await supabase.from('shipments').select('id,order_id').eq('status', 'failed');
      const failedOrderIds = [...new Set((failedShipmentRows || []).map((s: any) => s.order_id).filter(Boolean))] as string[];
      if (failedOrderIds.length) {
        let paidOrderQuery = supabase.from('orders').select('id').in('id', failedOrderIds).eq('payment_status', 'paid').eq('is_deleted', false).not('order_status', 'in', '("cancelled","refunded","failed")');
        if (storeId && storeId !== 'all') paidOrderQuery = paidOrderQuery.eq('store_id', storeId);
        const { data: paidShipmentOrders } = await paidOrderQuery;
        const validOrderIds = new Set((paidShipmentOrders || []).map((o: any) => o.id));
        const failedShipments = (failedShipmentRows || []).filter((s: any) => validOrderIds.has(s.order_id)).length;
        if (failedShipments > 0) alerts.push({ id: 'ship-failed', type: 'shipping', severity: 'critical', title: `${failedShipments} Shipping Failures`, subtitle: 'Paid orders · courier or label errors', count: failedShipments, actionUrl: '/shipping?status=failed', actionLabel: 'Fix Shipments' });
      }
    } catch (e) {
      console.error('[ActionRequiredService] Error fetching alerts:', e);
    }

    return alerts;
  }
}
