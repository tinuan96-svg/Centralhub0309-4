import { supabase } from '@/lib/supabase';

export interface SearchResult {
  id: string;
  type: 'order' | 'product' | 'customer' | 'store';
  title: string;
  subtitle: string;
  url: string;
  metadata?: any;
}

export class SearchService {
  static async globalSearch(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];

    const results: SearchResult[] = [];
    const q = `%${query}%`;

    try {
      const [orders, products, stores] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, customer_email')
          .or(`order_number.ilike.${q},customer_name.ilike.${q},customer_email.ilike.${q},customer_phone.ilike.${q}`)
          .limit(5),
        supabase
          .from('products')
          .select('id, name, sku')
          .or(`name.ilike.${q},sku.ilike.${q}`)
          .is('is_deleted', false)
          .limit(5),
        supabase
          .from('stores')
          .select('id, name, slug')
          .or(`name.ilike.${q},slug.ilike.${q}`)
          .limit(3)
      ]);

      if (orders.data) {
        orders.data.forEach(o => results.push({
          id: o.id,
          type: 'order',
          title: `Order #${o.order_number}`,
          subtitle: o.customer_name,
          url: `/orders?id=${o.id}`
        }));
      }

      if (products.data) {
        products.data.forEach(p => results.push({
          id: p.id,
          type: 'product',
          title: p.name,
          subtitle: p.sku || 'No SKU',
          url: `/inventory?id=${p.id}`
        }));
      }

      if (stores.data) {
        stores.data.forEach(s => results.push({
          id: s.id,
          type: 'store',
          title: s.name,
          subtitle: `/${s.slug}`,
          url: `/stores/${s.id}`
        }));
      }

    } catch (e) {
      console.error('[SearchService] Error during global search:', e);
    }

    return results;
  }
}
