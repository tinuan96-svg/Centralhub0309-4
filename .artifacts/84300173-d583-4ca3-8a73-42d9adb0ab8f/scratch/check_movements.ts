import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const sku = 'ALM-HIM-1-G'; // Almond Soap
  const { data: products } = await supabase.from('products').select('id').eq('sku', sku);
  if (!products || products.length === 0) return;
  const pid = products[0].id;

  console.log(`--- MOVEMENTS FOR ${sku} ---`);
  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('product_id', pid)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(movements);

  const { data: items } = await supabase
    .from('order_items')
    .select('order_id, quantity, orders!inner(order_number, payment_status, order_status)')
    .eq('product_id', pid)
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending', 'shipment_booked']);

  console.log(`\nActive Paid Items for ${sku}:`, items?.map((i: any) => ({ num: i.orders.order_number, qty: i.quantity, status: i.orders.order_status })));
}
check();
