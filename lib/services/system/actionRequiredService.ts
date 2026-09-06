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
      // 1. Inventory Alerts
      let invQuery = supabase
        .from('central_inventory')
        .select('product_id, stock_quantity, low_stock_threshold', { count: 'exact', head: true });

      // If store-specific, we'd ideally need a join or a list of product IDs for that store.
      // For now, inventory is global in CentralHub, but store_products can filter it.

      const [outOfStock, lowStock] = await Promise.all([
        supabase.from('central_inventory').select('*', { count: 'exact', head: true }).lte('stock_quantity', 0),
        supabase.from('central_inventory').select('*', { count: 'exact', head: true }).lte('stock_quantity', 5).gt('stock_quantity', 0)
      ]);

      if (outOfStock.count && outOfStock.count > 0) {
        alerts.push({
          id: 'inv-out',
          type: 'inventory',
          severity: 'critical',
          title: `${outOfStock.count} Products Out of Stock`,
          subtitle: 'Urgent replenishment required',
          count: outOfStock.count,
          actionUrl: '/inventory?filter=out',
          actionLabel: 'View Products'
        });
      }

      if (lowStock.count && lowStock.count > 0) {
        alerts.push({
          id: 'inv-low',
          type: 'inventory',
          severity: 'warning',
          title: `${lowStock.count} Products Low in Stock`,
          subtitle: 'Stock levels below threshold',
          count: lowStock.count,
          actionUrl: '/inventory?filter=low',
          actionLabel: 'View Products'
        });
      }

      // 2. Order Alerts
      let ordersQuery = supabase.from('orders').select('id, order_status, created_at');
      if (storeId && storeId !== 'all') {
        ordersQuery = ordersQuery.eq('store_id', storeId);
      }

      const { data: activeOrders } = await ordersQuery.in('order_status', ['confirmed', 'picking', 'packing']);

      const awaitingPacking = activeOrders?.filter(o => o.order_status === 'confirmed').length || 0;
      const inPacking = activeOrders?.filter(o => o.order_status === 'packing').length || 0;

      if (awaitingPacking > 0) {
        alerts.push({
          id: 'order-packing',
          type: 'order',
          severity: 'info',
          title: `${awaitingPacking} Orders Awaiting Packing`,
          subtitle: 'Ready to be processed',
          count: awaitingPacking,
          actionUrl: '/packing',
          actionLabel: 'Open Packing'
        });
      }

      // 3. Payment Alerts
      let paymentQuery = supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'failed');
      if (storeId && storeId !== 'all') {
        paymentQuery = paymentQuery.eq('store_id', storeId);
      }
      const { count: failedPayments } = await paymentQuery;

      if (failedPayments && failedPayments > 0) {
        alerts.push({
          id: 'pay-failed',
          type: 'payment',
          severity: 'critical',
          title: `${failedPayments} Failed Payments`,
          subtitle: 'Requires customer follow-up',
          count: failedPayments,
          actionUrl: '/orders?paymentStatus=failed',
          actionLabel: 'View Orders'
        });
      }

      // 4. Shipping Alerts
      let shippingQuery = supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('status', 'failed');
      // Joining shipments with orders to filter by store is complex in a single query without RPC
      const { count: failedShipments } = await shippingQuery;

      if (failedShipments && failedShipments > 0) {
        alerts.push({
          id: 'ship-failed',
          type: 'shipping',
          severity: 'critical',
          title: `${failedShipments} Shipping Failures`,
          subtitle: 'Label generation or courier errors',
          count: failedShipments,
          actionUrl: '/shipping?status=failed',
          actionLabel: 'Fix Shipments'
        });
      }

    } catch (e) {
      console.error('[ActionRequiredService] Error fetching alerts:', e);
    }

    return alerts;
  }
}
