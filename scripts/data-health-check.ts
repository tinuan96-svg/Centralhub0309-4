import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('--- DATA HEALTH DIAGNOSTIC ---');

  // 1. Headline Revenue (Last 30 Days)
  const start = new Date();
  start.setDate(start.getDate() - 30);

  const { data: orders } = await supabase
    .from('orders')
    .select('id, total, delivery_fee, store_id')
    .eq('payment_status', 'paid')
    .not('order_status', 'in', '("cancelled","refunded")')
    .gte('created_at', start.toISOString());

  const headlineRev = orders?.reduce((s, o) => s + (o.total - (o.delivery_fee || 0)), 0) || 0;
  console.log(`Headline Revenue (Last 30d, Paid): £${headlineRev.toFixed(2)}`);
  console.log(`Order count: ${orders?.length || 0}`);

  // 2. Store-wise Revenue
  const storeMap: Record<string, number> = {};
  orders?.forEach(o => {
    const sid = o.store_id || 'unknown';
    storeMap[sid] = (storeMap[sid] || 0) + (o.total - (o.delivery_fee || 0));
  });
  console.log('Revenue by Store:', storeMap);

  // 3. Category Revenue (from items)
  const orderIds = orders?.map(o => o.id) || [];
  const { data: items } = await supabase
    .from('order_items')
    .select('total_price')
    .in('order_id', orderIds);

  const itemTotal = items?.reduce((s, i) => s + (i.total_price || 0), 0) || 0;
  console.log(`Sum of Order Items: £${itemTotal.toFixed(2)}`);

  if (Math.abs(headlineRev - itemTotal) > 10) {
    console.log('⚠️ MISMATCH: Headline Revenue vs Item Sum');
  } else {
    console.log('✅ MATCH: Headline Revenue vs Item Sum');
  }

  // 4. Low Stock Check
  const { data: lowStock } = await supabase
    .from('central_inventory')
    .select('product_id')
    .lte('stock_quantity', 5)
    .gt('stock_quantity', 0);

  console.log(`Low Stock Products (1-5): ${lowStock?.length || 0}`);

  const { data: outOfStock } = await supabase
    .from('central_inventory')
    .select('product_id')
    .lte('stock_quantity', 0);
  console.log(`Out of Stock Products (<=0): ${outOfStock?.length || 0}`);
}

run();
