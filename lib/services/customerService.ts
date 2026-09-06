import { supabase } from '../supabase';

export interface CustomerSummary {
  key: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  total_orders: number;
  total_value: number;
  total_profit: number;
  last_order_status: string;
  last_order_date: string;
  last_store_name: string;
}

export class CustomerService {
  static async getAllCustomers(storeId?: string | null): Promise<CustomerSummary[]> {
    try {
      let query = supabase
        .from('orders')
        .select(
          'id, customer_name, customer_email, customer_phone, delivery_address, delivery_city, delivery_postcode, total, gross_profit, order_status, store_id, created_at'
        );

      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data: orders, error } = await query.order('created_at', { ascending: true });

      if (error || !orders) {
        console.error('Error fetching customers:', error);
        return [];
      }

      const storeIds = Array.from(
        new Set(orders.map((o: any) => o.store_id).filter(Boolean))
      ) as string[];

      const storeMap = new Map<string, string>();
      if (storeIds.length > 0) {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, name')
          .in('id', storeIds);
        stores?.forEach((s: any) => storeMap.set(s.id, s.name));
      }

      const customerMap = new Map<string, CustomerSummary>();

      for (const order of orders as any[]) {
        const email = (order.customer_email || '').trim().toLowerCase();
        const name = (order.customer_name || '').trim();
        const key = email || name || order.id;

        const existing = customerMap.get(key);
        if (existing) {
          existing.total_orders += 1;
          existing.total_value += Number(order.total || 0);
          existing.total_profit += Number(order.gross_profit || 0);

          if (new Date(order.created_at) > new Date(existing.last_order_date)) {
            existing.last_order_date = order.created_at;
            existing.last_order_status = order.order_status || '';
            existing.last_store_name = order.store_id
              ? storeMap.get(order.store_id) || ''
              : '';
            if (order.customer_phone) existing.phone = order.customer_phone;
            if (order.delivery_address)
              existing.address = order.delivery_address;
            if (order.delivery_city) existing.city = order.delivery_city;
            if (order.delivery_postcode)
              existing.postcode = order.delivery_postcode;
          }
        } else {
          customerMap.set(key, {
            key,
            name: name || 'Unknown Customer',
            email: order.customer_email || '',
            phone: order.customer_phone || '',
            address: order.delivery_address || '',
            city: order.delivery_city || '',
            postcode: order.delivery_postcode || '',
            total_orders: 1,
            total_value: Number(order.total || 0),
            total_profit: Number(order.gross_profit || 0),
            last_order_status: order.order_status || '',
            last_order_date: order.created_at,
            last_store_name: order.store_id
              ? storeMap.get(order.store_id) || ''
              : '',
          });
        }
      }

      return Array.from(customerMap.values()).sort(
        (a, b) =>
          new Date(b.last_order_date).getTime() -
          new Date(a.last_order_date).getTime()
      );
    } catch (err) {
      console.error('Unexpected error in getAllCustomers:', err);
      return [];
    }
  }
}
