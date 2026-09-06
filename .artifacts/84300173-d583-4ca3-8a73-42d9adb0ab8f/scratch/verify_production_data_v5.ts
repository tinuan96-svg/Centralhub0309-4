import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- STORE ISOLATION VERIFICATION (V5) ---');

  const { data: stores } = await supabase.from('stores').select('id, name');
  if (!stores || stores.length < 2) { console.log('Not enough stores for isolation test.'); return; }

  // Find a product that has orders in at least one store
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(store_id, payment_status, order_status)')
    .eq('orders.payment_status', 'paid')
    .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending'])
    .limit(100);

  if (!orderItems || orderItems.length === 0) { console.log('No unfulfilled paid orders found.'); return; }

  const productIds = Array.from(new Set(orderItems.map((oi: any) => oi.product_id)));
  const { data: products } = await supabase.from('products').select('id, name').in('id', productIds);

  for (const p of products || []) {
    console.log(`\nProduct: ${p.name}`);
    for (const store of stores) {
      const storeBacklog = orderItems
        .filter((oi: any) => oi.product_id === p.id && oi.orders.store_id === store.id)
        .reduce((sum, o) => sum + (o.quantity || 0), 0);
      console.log(`  Store ${store.name}: ${storeBacklog} units`);
    }
  }

  // Verify Existing PO Deduction
  console.log('\n--- PO DEDUCTION VERIFICATION ---');
  const { data: poDrafts } = await supabase.from('po_drafts').select('*').eq('status', 'draft').limit(5);
  if (poDrafts && poDrafts.length > 0) {
    const draft = poDrafts[0];
    const items = draft.draft_items || [];
    console.log(`PO Draft ID: ${draft.id} for Store: ${draft.store_id || 'Global'}`);
    if (items.length > 0) {
        const item = items[0];
        console.log(`  Item: ${item.product_name}, Qty: ${item.units_total || (item.packs * item.pack_size)}`);
    }
  } else {
    console.log('No PO drafts found to verify deduction.');
  }
}

verify();
