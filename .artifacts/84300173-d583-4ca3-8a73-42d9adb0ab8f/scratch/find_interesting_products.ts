import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function find() {
  console.log('--- SEARCHING FOR INTERESTING DATA ---');

  // 1. Products with negative stock
  const { data: negStock } = await supabase
    .from('central_inventory')
    .select('product_id, stock_quantity, product_name')
    .lt('stock_quantity', 0)
    .limit(5);
  console.log('Negative Stock Products:', negStock);

  // 2. Unfulfilled paid order items
  const { data: orders } = await supabase
    .from('order_items')
    .select('product_id, product_name, quantity, orders!inner(order_number, payment_status, order_status)')
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending'])
    .limit(10);

  if (orders) {
    console.log('Paid Outstanding Orders (Items):', orders.map((o: any) => ({ name: o.product_name, qty: o.quantity, order: o.orders.order_number })));
  }

  // 3. Products with PO Drafts
  const { data: drafts } = await supabase
    .from('po_drafts')
    .select('draft_items')
    .eq('status', 'draft')
    .limit(5);

  if (drafts && drafts.length > 0) {
    console.log('PO Draft Sample Items:', drafts[0].draft_items?.slice(0, 3));
  }

  // 4. Sample Products from Orders
  const ids = orders?.map((o: any) => o.product_id).filter(Boolean) || [];
  if (ids.length > 0) {
    const { data: sampleProducts } = await supabase
        .from('products')
        .select('id, name, sku, pack_size')
        .in('id', ids);
    console.log('Sample Products from Orders:', sampleProducts);
  }
}
find();
