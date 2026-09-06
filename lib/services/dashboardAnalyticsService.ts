import { supabase } from '../supabase';

export interface TimeSeriesDataPoint {
  date: string;
  revenue: number;
  orders: number;
  profit: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

export interface StoreRevenue {
  storeId: string;
  storeName: string;
  revenue: number;
  percentage: number;
  color: string;
}

export interface CityData {
  city: string;
  orderCount: number;
  percentage: number;
}

export interface HeatmapData {
  day: string;
  hour: number;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#64748b',
  confirmed: '#10b981',
  picking: '#3b82f6',
  packing: '#f59e0b',
  packed: '#d97706',
  ready_to_ship: '#14b8a6',
  shipment_booked: '#6366f1',
  shipped: '#8b5cf6',
  delivered: '#10b981',
  completed: '#059669',
  cancelled: '#ef4444',
  refunded: '#94a3b8',
};

const STORE_COLORS = ['#22d3ee', '#3b82f6', '#10b981', '#f59e0b', '#f43f5e'];

export class DashboardAnalyticsService {
  /**
   * Fetch total overhead (expenses) for a date range and optionally a store
   */
  static async getOverhead(startDate: Date, endDate: Date, storeId?: string): Promise<number> {
    try {
      let query = supabase
        .from('expenses')
        .select('amount_gross')
        .gte('invoice_date', startDate.toISOString())
        .lte('invoice_date', endDate.toISOString())
        .eq('payment_status', 'paid');

      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).reduce((sum, e) => sum + (Number(e.amount_gross) || 0), 0);
    } catch (err) {
      console.error('[DashboardAnalytics] Error fetching overhead:', err);
      return 0;
    }
  }

  static async getTimeSeriesData(startDate: Date, endDate: Date, storeId?: string): Promise<TimeSeriesDataPoint[]> {
    try {
      let query = supabase
        .from('orders')
        .select('created_at, total, delivery_fee, order_status, payment_status, gross_profit')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('Error fetching time series data:', error);
        return [];
      }

      if (!orders || orders.length === 0) {
        return [];
      }

      // Only count paid orders for revenue — exclude unpaid, cancelled and refunded
      const validOrders = orders.filter(o =>
        o.payment_status === 'paid' && !['cancelled', 'refunded'].includes(o.order_status)
      );

      const groupedByDate: Record<string, { revenue: number; orders: number; profit: number }> = {};

      validOrders.forEach(order => {
        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!groupedByDate[date]) {
          groupedByDate[date] = { revenue: 0, orders: 0, profit: 0 };
        }
        // Revenue Definition: Total - Delivery (Product-only headline)
        const productRevenue = (order.total || 0) - (order.delivery_fee || 0);
        groupedByDate[date].revenue += productRevenue;
        groupedByDate[date].orders += 1;
        // Use real gross profit if available, fallback to 25% estimate
        groupedByDate[date].profit += order.gross_profit || Math.floor(productRevenue * 0.25);
      });

      return Object.entries(groupedByDate).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
        profit: data.profit,
      }));
    } catch (error) {
      console.error('Error in getTimeSeriesData:', error);
      return [];
    }
  }

  static async getOrderStatusBreakdown(startDate: Date, endDate: Date, storeId?: string): Promise<OrderStatusBreakdown[]> {
    try {
      let query = supabase
        .from('orders')
        .select('order_status')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('Error fetching order status breakdown:', error);
        return [];
      }

      if (!orders || orders.length === 0) {
        return [];
      }

      const statusCounts: Record<string, number> = {};
      orders.forEach(order => {
        const status = order.order_status || 'pending';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      const total = orders.length;

      return Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: (count / total) * 100,
        color: STATUS_COLORS[status] || '#6b7280',
      }));
    } catch (error) {
      console.error('Error in getOrderStatusBreakdown:', error);
      return [];
    }
  }


  static async getRevenueByStore(startDate: Date, endDate: Date): Promise<StoreRevenue[]> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('total, store_id, order_status, payment_status')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) {
        console.error('Error fetching revenue by store:', error);
        return [];
      }

      if (!orders || orders.length === 0) {
        return [];
      }

      // Only count paid orders for revenue
      const validOrders = orders.filter(o =>
        o.payment_status === 'paid' && !['cancelled', 'refunded'].includes(o.order_status)
      );

      const { data: stores } = await supabase
        .from('stores')
        .select('id, name');

      const storeMap = new Map(stores?.map(s => [s.id, s.name]) || []);

      const storeRevenue: Record<string, number> = {};
      validOrders.forEach(order => {
        if (order.store_id) {
          storeRevenue[order.store_id] = (storeRevenue[order.store_id] || 0) + (order.total || 0);
        }
      });

      const totalRevenue = Object.values(storeRevenue).reduce((sum, rev) => sum + rev, 0);

      return Object.entries(storeRevenue).map(([storeId, revenue], index) => ({
        storeId,
        storeName: storeMap.get(storeId) || `Store ${storeId}`,
        revenue,
        percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
        color: STORE_COLORS[index % STORE_COLORS.length],
      }));
    } catch (error) {
      console.error('Error in getRevenueByStore:', error);
      return [];
    }
  }

  static async getTopCities(startDate: Date, endDate: Date, limit: number = 5): Promise<CityData[]> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('delivery_city')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) {
        console.error('Error fetching top cities:', error);
        return [];
      }

      if (!orders || orders.length === 0) {
        return [];
      }

      const cityCounts: Record<string, number> = {};
      orders.forEach(order => {
        if (order.delivery_city) {
          cityCounts[order.delivery_city] = (cityCounts[order.delivery_city] || 0) + 1;
        }
      });

      const total = orders.length;

      return Object.entries(cityCounts)
        .map(([city, count]) => ({
          city,
          orderCount: count,
          percentage: (count / total) * 100,
        }))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in getTopCities:', error);
      return [];
    }
  }

  static async getRepeatCustomerStats(startDate: Date, endDate: Date): Promise<{
    totalCustomers: number;
    repeatCustomers: number;
    percentage: number;
  }> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('customer_email')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) {
        console.error('Error fetching repeat customer stats:', error);
        return { totalCustomers: 0, repeatCustomers: 0, percentage: 0 };
      }

      if (!orders || orders.length === 0) {
        return { totalCustomers: 0, repeatCustomers: 0, percentage: 0 };
      }

      const customerCounts: Record<string, number> = {};
      orders.forEach(order => {
        if (order.customer_email) {
          customerCounts[order.customer_email] = (customerCounts[order.customer_email] || 0) + 1;
        }
      });

      const totalCustomers = Object.keys(customerCounts).length;
      const repeatCustomers = Object.values(customerCounts).filter(count => count > 1).length;

      return {
        totalCustomers,
        repeatCustomers,
        percentage: totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0,
      };
    } catch (error) {
      console.error('Error in getRepeatCustomerStats:', error);
      return { totalCustomers: 0, repeatCustomers: 0, percentage: 0 };
    }
  }

  static async getStoreTimeSeriesData(startDate: Date, endDate: Date): Promise<{
    storeId: string;
    storeName: string;
    data: TimeSeriesDataPoint[];
  }[]> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('created_at, total, delivery_fee, store_id, order_status, payment_status, gross_profit')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching store time series data:', error);
        return [];
      }

      const { data: stores } = await supabase.from('stores').select('id, name');
      const storeMap = new Map(stores?.map(s => [s.id, s.name]) || []);

      const groupedByStore: Record<string, Record<string, { revenue: number; orders: number; profit: number }>> = {};

      orders?.forEach(order => {
        if (!order.store_id || order.payment_status !== 'paid' || ['cancelled', 'refunded'].includes(order.order_status)) return;

        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!groupedByStore[order.store_id]) groupedByStore[order.store_id] = {};
        if (!groupedByStore[order.store_id][date]) {
          groupedByStore[order.store_id][date] = { revenue: 0, orders: 0, profit: 0 };
        }

        const productRevenue = (order.total || 0) - (order.delivery_fee || 0);
        groupedByStore[order.store_id][date].revenue += productRevenue;
        groupedByStore[order.store_id][date].orders += 1;
        groupedByStore[order.store_id][date].profit += order.gross_profit || Math.floor(productRevenue * 0.25);
      });

      return Array.from(storeMap.entries()).map(([storeId, storeName]) => {
        const storeData = groupedByStore[storeId] || {};
        const data = Object.entries(storeData).map(([date, vals]) => ({
          date,
          ...vals
        }));
        return { storeId, storeName, data };
      });
    } catch (error) {
      console.error('Error in getStoreTimeSeriesData:', error);
      return [];
    }
  }
}
