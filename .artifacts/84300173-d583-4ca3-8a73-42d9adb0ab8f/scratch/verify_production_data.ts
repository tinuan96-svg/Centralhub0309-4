import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- FETCHING PRODUCTION DATA ---');

  // 1. Find a variety of products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, sku, sales_velocity_30d, low_stock_threshold, pack_size')
    .limit(30);

  if (pErr) { console.error('Error fetching products:', pErr); return; }

  const productIds = products.map(p => p.id);

  // 2. Fetch Central Inventory
  const { data: inventory, error: iErr } = await supabase
    .from('central_inventory')
    .select('*')
    .in('product_id', productIds);

  if (iErr) { console.error('Error fetching inventory:', iErr); return; }

  // 3. Fetch Supplier Info
  const { data: supplierInfo, error: sErr } = await supabase
    .from('product_suppliers')
    .select('*, suppliers(name)')
    .in('product_id', productIds)
    .eq('is_preferred', true);

  // 4. Fetch Unfulfilled Paid Order Items
  const { data: orderItems, error: oErr } = await supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(order_number, payment_status, order_status, store_id)')
    .in('product_id', productIds)
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending']);

  // 5. Fetch PO Drafts
  const { data: poDrafts } = await supabase
    .from('po_drafts')
    .select('draft_items, store_id')
    .eq('status', 'draft');

  // 6. Fetch Supplier Invoices
  const { data: invoices } = await supabase
    .from('supplier_invoice_items')
    .select('product_id, quantity, received_quantity, supplier_invoices!inner(status, store_id)')
    .in('supplier_invoices.status', ['received', 'approved', 'draft']);

  console.log('Total Products Analyzed:', products.length);
  console.log('Inventory Rows:', inventory.length);
  console.log('Supplier Links:', supplierInfo?.length || 0);
  console.log('Unfulfilled Paid Items:', orderItems?.length || 0);

  // Filter for interesting products
  const interestingProducts = products.filter(p => {
    const inv = inventory.find(i => i.product_id === p.id);
    const orders = orderItems?.filter(oi => oi.product_id === p.id) || [];
    const backlog = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const sup = supplierInfo?.find(s => s.product_id === p.id);

    // Interesting if: backlog > 0 OR stock < 0 OR onPo > 0 OR high velocity
    return backlog > 0 || (inv?.stock_quantity || 0) <= 0 || Number(p.sales_velocity_30d) > 0;
  }).slice(0, 10);

  console.log('\n--- TRACING RECOMMENDATIONS FOR ' + interestingProducts.length + ' PRODUCTS ---');

  for (const p of interestingProducts) {
    const inv = inventory.find(i => i.product_id === p.id);
    const sup = supplierInfo?.find(s => s.product_id === p.id);
    const orders = orderItems?.filter(oi => oi.product_id === p.id) || [];
    const backlog = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);

    // Calculate On PO
    let onPo = 0;
    poDrafts?.forEach((d: any) => {
      const items = Array.isArray(d.draft_items) ? d.draft_items : [];
      items.forEach((item: any) => {
        if (item.product_id === p.id) onPo += (item.units_total || 0);
      });
    });
    invoices?.forEach((ii: any) => {
      if (ii.product_id === p.id) onPo += Math.max(0, (ii.quantity || 0) - (ii.received_quantity || 0));
    });

    const stock = inv?.stock_quantity ?? 0;
    const reserved = inv?.reserved_quantity ?? 0;
    const available = stock - reserved;
    const backorderDebt = Math.max(0, -available);
    const dailyVelocity = Number(p.sales_velocity_30d || 0);
    const leadTime = sup?.lead_time_days ?? 7;
    const leadTimeDemand = dailyVelocity * leadTime;
    const safetyStock = Math.max(p.low_stock_threshold || 0, dailyVelocity * 3);
    const forwardCoverageDemand = dailyVelocity * 14;
    const targetStock = leadTimeDemand + safetyStock + forwardCoverageDemand;

    let requiredUnits = Math.max(backorderDebt, targetStock - available) - onPo;
    requiredUnits = Math.max(0, requiredUnits);
    if (backorderDebt > onPo + available) {
        requiredUnits = Math.max(requiredUnits, backorderDebt - (onPo + Math.max(0, available)));
    }

    const moq = sup?.minimum_order_qty ?? 1;
    const packSize = sup?.pack_size ?? p.pack_size ?? 1;

    let recommended = 0;
    if (requiredUnits > 0) {
      recommended = Math.max(requiredUnits, moq);
      recommended = Math.ceil(recommended / packSize) * packSize;
    }

    console.log(`\nProduct: ${p.name} (${p.sku})`);
    console.log(`Stock: ${stock}, Reserved: ${reserved}, Available: ${available}`);
    console.log(`Backlog: ${backlog}, Backorder Debt: ${backorderDebt}`);
    console.log(`Velocity: ${dailyVelocity}, Lead Time: ${leadTime}, LT Demand: ${leadTimeDemand.toFixed(1)}`);
    console.log(`Safety Stock: ${safetyStock.toFixed(1)}, 14d Coverage: ${forwardCoverageDemand.toFixed(1)}`);
    console.log(`On PO: ${onPo}, Target Stock: ${targetStock.toFixed(1)}`);
    console.log(`Required Units: ${requiredUnits.toFixed(1)}, MOQ: ${moq}, Pack Size: ${packSize}`);
    console.log(`FINAL RECOMMENDED: ${recommended}`);
  }
}

verify();
