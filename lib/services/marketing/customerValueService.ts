import { supabase } from '@/lib/supabase';
import { Order } from '@/lib/types';
import { intelligenceService } from './intelligenceService';

export interface CustomerValueMetrics {
  customer_key: string;
  total_revenue: number;
  total_profit: number;
  order_count: number;
  aov: number;
  margin_percent: number;
  first_purchase_at: string;
  last_purchase_at: string;
  lifecycle_stage: string;
}

export const customerValueService = {
  /**
   * Calculate aggregated value metrics for a customer based on order history.
   */
  async calculateMetrics(customerOrders: Order[]): Promise<CustomerValueMetrics | null> {
    if (customerOrders.length === 0) return null;

    const totalRevenue = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalProfit = customerOrders.reduce((sum, o) => sum + (o.gross_profit || 0), 0);
    const orderCount = customerOrders.length;
    const aov = totalRevenue / orderCount;
    const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const dates = customerOrders.map(o => new Date(o.created_at).getTime());
    const firstPurchaseAt = new Date(Math.min(...dates)).toISOString();
    const lastPurchaseAt = new Date(Math.max(...dates)).toISOString();

    const lifecycleStage = await intelligenceService.calculateLifecycle(customerOrders);

    return {
      customer_key: customerOrders[0].customer_email || customerOrders[0].customer_phone || customerOrders[0].id,
      total_revenue: totalRevenue,
      total_profit: totalProfit,
      order_count: orderCount,
      aov,
      margin_percent: marginPercent,
      first_purchase_at: firstPurchaseAt,
      last_purchase_at: lastPurchaseAt,
      lifecycle_stage: lifecycleStage
    };
  }
};
