import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- FETCHING PRODUCTION DATA (V2) ---');

  // 1. Get a list of stores to test isolation
  const { data: stores } = await supabase.from('stores').select('id, name');
  console.log('Stores:', stores?.map(s => s.name).join(', '));

  // 2. Fetch products and their available columns
  const { data: allProducts, error: pErr } = await supabase
    .from('products')
    .select('*')
    .limit(50);

  if (pErr) { console.error('Error fetching products:', pErr); return; }

  const productIds = allProducts.map(p => p.id);

  // 3. Fetch Central Inventory
  const { data: inventory } = await supabase
    .from('central_inventory')
    .select('*')
    .in('product_id', productIds);

  // 4. Fetch Supplier Info
  const { data: supplierInfo } = await supabase
    .from('product_suppliers')
    .select('*, suppliers(name)')
    .in('product_id', productIds)
    .eq('is_preferred', true);

  // 5. Fetch Unfulfilled Paid Order Items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(order_number, payment_status, order_status, store_id)')
    .in('product_id', productIds)
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending']);

  // 6. Fetch PO Drafts and Supplier Invoices for "On PO"
  const { data: poDrafts } = await supabase.from('po_drafts').select('draft_items, store_id').eq('status', 'draft');
  const { data: invoiceItems } = await supabase.from('supplier_invoice_items').select('product_id, quantity, received_quantity, supplier_invoices!inner(status, store_id)').in('supplier_invoices.status', ['received', 'approved', 'draft']);

  // Selection Logic for specific test cases
  const testProducts = [];

  // Case: Backordered (negative stock)
  const backordered = allProducts.find(p => inventory?.find(i => i.product_id === p.id && i.stock_quantity < 0));
  if (backordered) testProducts.push({ product: backordered, case: 'Backordered' });

  // Case: Paid Outstanding Demand
  const withBacklog = allProducts.find(p => orderItems?.find(oi => oi.product_id === p.id));
  if (withBacklog) testProducts.push({ product: withBacklog, case: 'Backlog Demand' });

  // Case: Incoming Stock
  const withIncoming = allProducts.find(p =>
    poDrafts?.some((d: any) => d.draft_items?.some((i: any) => i.product_id === p.id)) ||
    invoiceItems?.some((ii: any) => ii.product_id === p.id)
  );
  if (withIncoming) testProducts.push({ product: withIncoming, case: 'Incoming Stock' });

  // Add a few more to make it 5-10
  allProducts.slice(0, 5).forEach(p => {
    if (!testProducts.find(tp => tp.product.id === p.id)) {
        testProducts.push({ product: p, case: 'General' });
    }
  });

  console.log('\n--- TRACING RECOMMENDATIONS ---');

  for (const tp of testProducts) {
    const p = tp.product;
    const inv = inventory?.find(i => i.product_id === p.id);
    const sup = supplierInfo?.find(s => s.product_id === p.id);
    const backlogItems = orderItems?.filter(oi => oi.product_id === p.id) || [];
    const backlog = backlogItems.reduce((sum, o) => sum + (o.quantity || 0), 0);

    // On PO calculation (Global for now)
    let onPo = 0;
    poDrafts?.forEach((d: any) => {
      d.draft_items?.forEach((item: any) => {
        if (item.product_id === p.id) onPo += (item.units_total || 0);
      });
    });
    invoiceItems?.forEach((ii: any) => {
      if (ii.product_id === p.id) onPo += Math.max(0, (ii.quantity || 0) - (ii.received_quantity || 0));
    });

    // Formulas from procurementService.ts
    const stock = inv?.stock_quantity ?? 0;
    const reserved = inv?.reserved_quantity ?? 0;
    const available = stock - reserved;
    const backorderDebt = Math.max(0, -available);
    const dailyVelocity = Number((p as any).sales_velocity_30d || 0);
    const leadTime = sup?.lead_time_days ?? 7;
    const leadTimeDemand = dailyVelocity * leadTime;
    const safetyStock = Math.max(inv?.low_stock_threshold || 0, dailyVelocity * 3);
    const forwardCoverageDemand = dailyVelocity * 14;
    const targetStock = leadTimeDemand + safetyStock + forwardCoverageDemand;

    let requiredUnits = Math.max(backorderDebt, targetStock - available) - onPo;
    requiredUnits = Math.max(0, requiredUnits);
    if (backorderDebt > onPo + available) {
        requiredUnits = Math.max(requiredUnits, backorderDebt - (onPo + Math.max(0, available)));
    }

    const moq = sup?.minimum_order_qty ?? 1;
    const packSize = sup?.pack_size ?? (p as any).pack_size ?? 1;

    let recommended = 0;
    if (requiredUnits > 0) {
      recommended = Math.max(requiredUnits, moq);
      recommended = Math.ceil(recommended / packSize) * packSize;
    }

    console.log(`\n[${tp.case}] ${p.name} (${p.sku})`);
    console.log(`  Stock: ${stock}, Reserved: ${reserved}, Available: ${available}`);
    console.log(`  Backlog (Paid): ${backlog}, Calculated Debt: ${backorderDebt}`);
    console.log(`  Velocity: ${dailyVelocity}, LT Demand: ${leadTimeDemand.toFixed(1)} (${leadTime}d)`);
    console.log(`  Safety Stock: ${safetyStock}, 14d Coverage: ${forwardCoverageDemand.toFixed(1)}`);
    console.log(`  Incoming (PO/Inv): ${onPo}, Target Stock: ${targetStock.toFixed(1)}`);
    console.log(`  Required: ${requiredUnits.toFixed(1)}, MOQ: ${moq}, Pack Size: ${packSize}`);
    console.log(`  FINAL RECOMMENDED: ${recommended}`);
  }

  // Store Isolation Verification
  if (stores && stores.length >= 2) {
    console.log('\n--- STORE ISOLATION VERIFICATION ---');
    const storeA = stores[0];
    const storeB = stores[1];
    const p = testProducts[0].product;

    const backlogA = orderItems?.filter(oi => oi.product_id === p.id && oi.orders.store_id === storeA.id)
                        .reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
    const backlogB = orderItems?.filter(oi => oi.product_id === p.id && oi.orders.store_id === storeB.id)
                        .reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

    console.log(`Product: ${p.name}`);
    console.log(`  Demand in ${storeA.name}: ${backlogA}`);
    console.log(`  Demand in ${storeB.name}: ${backlogB}`);
    if (backlogA !== backlogB) {
        console.log('  PASS: Store demand differs correctly.');
    } else {
        console.log('  INFO: Store demand identical (likely 0/0 or equal orders).');
    }
  }
}

verify();
