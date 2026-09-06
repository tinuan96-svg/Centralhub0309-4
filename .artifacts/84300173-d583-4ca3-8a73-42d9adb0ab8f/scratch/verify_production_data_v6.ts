import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- FETCHING PRODUCTION DATA (V6 - TARGETED) ---');

  // 1. Fetch unfulfilled paid order items first to find active demand
  const { data: orderItems, error: oErr } = await supabase
    .from('order_items')
    .select('product_id, product_name, quantity, orders!inner(order_number, payment_status, order_status, store_id)')
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending', 'shipment_booked']);

  if (oErr || !orderItems) { console.error('Error fetching order items:', oErr); return; }

  const activeProductIds = Array.from(new Set(orderItems.map((oi: any) => oi.product_id).filter(Boolean)));
  console.log('Products with active demand:', activeProductIds.length);

  // 2. Fetch those products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .in('id', activeProductIds);

  // 3. Fetch Inventory for those products
  const { data: inventory } = await supabase
    .from('central_inventory')
    .select('*')
    .in('product_id', activeProductIds);

  // 4. Fetch Supplier Info
  const { data: supplierInfo } = await supabase
    .from('product_suppliers')
    .select('*, suppliers(name)')
    .in('product_id', activeProductIds)
    .eq('is_preferred', true);

  console.log('\n--- TRACING TOP 5 ACTIVE PRODUCTS ---');

  for (const p of products?.slice(0, 5) || []) {
    const inv = inventory?.find(i => i.product_id === p.id);
    const sup = supplierInfo?.find(s => s.product_id === p.id);
    const backlogItems = orderItems.filter((oi: any) => oi.product_id === p.id);
    const backlog = backlogItems.reduce((sum, o) => sum + (o.quantity || 0), 0);

    const stock = inv?.stock_quantity ?? 0;
    const reserved = inv?.reserved_quantity ?? 0;
    const available = stock - reserved;
    const backorderDebt = Math.max(0, -available);
    const dailyVelocity = Number(p.sales_velocity_30d || 0);
    const leadTime = sup?.lead_time_days ?? 7;
    const leadTimeDemand = dailyVelocity * leadTime;
    const safetyStock = Math.max(inv?.low_stock_threshold || 0, dailyVelocity * 3);
    const forwardCoverageDemand = dailyVelocity * 14;
    const targetStock = leadTimeDemand + safetyStock + forwardCoverageDemand;

    // Simplified On PO for tracing
    const onPo = 0;

    let requiredUnits = Math.max(backorderDebt, targetStock - available) - onPo;
    requiredUnits = Math.max(0, requiredUnits);

    const moq = sup?.minimum_order_qty ?? 1;
    const packSize = sup?.pack_size || p.pack_size || 1;

    let recommended = 0;
    if (requiredUnits > 0) {
      recommended = Math.max(requiredUnits, moq);
      recommended = Math.ceil(recommended / packSize) * packSize;
    }

    console.log(`\nProduct: ${p.name} (${p.sku})`);
    console.log(`  Stock: ${stock}, Reserved: ${reserved}, Available: ${available}`);
    console.log(`  Backlog (Paid): ${backlog}, Calculated Debt: ${backorderDebt}`);
    console.log(`  Velocity: ${dailyVelocity}, Safety Stock: ${safetyStock}`);
    console.log(`  Target Stock: ${targetStock.toFixed(1)}, Required: ${requiredUnits.toFixed(1)}`);
    console.log(`  MOQ: ${moq}, Pack Size: ${packSize}, FINAL RECOMMENDED: ${recommended}`);
  }

  // Double Counting Check
  console.log('\n--- DOUBLE COUNTING VERIFICATION ---');
  if (products && products.length > 0) {
    const p = products[0];
    const inv = inventory?.find(i => i.product_id === p.id);
    const backlog = orderItems.filter((oi: any) => oi.product_id === p.id).reduce((sum, o) => sum + (o.quantity || 0), 0);

    console.log(`Product: ${p.name}`);
    console.log(`  Current Stock in central_inventory: ${inv?.stock_quantity}`);
    console.log(`  Outstanding Paid Orders: ${backlog}`);
    console.log(`  Engine "Backorder Debt": ${Math.max(0, -( (inv?.stock_quantity || 0) - (inv?.reserved_quantity || 0) ))}`);
    console.log('  Observation: If stock is positive, backorder debt is 0. If stock is negative, it represents exactly how much we owe customers (and more).');
  }
}

verify();
