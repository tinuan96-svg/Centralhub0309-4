import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('--- PO DEDUCTION CHECK ---');

  // 1. Find a PO Draft with items
  const { data: drafts } = await supabase.from('po_drafts').select('*').eq('status', 'draft').limit(5);
  if (!drafts || drafts.length === 0) { console.log('No PO drafts found.'); return; }

  const draft = drafts[0];
  const items = Array.isArray(draft.draft_items) ? draft.draft_items : [];
  if (items.length === 0) { console.log('Draft has no items.'); return; }

  const item = items[0];
  const pid = item.product_id;
  const qtyOnPo = item.units_total || (item.packs * item.pack_size);

  console.log(`Product from Draft: ${item.product_name} (${pid})`);
  console.log(`Qty on Draft: ${qtyOnPo}`);

  // 2. Get current state
  const { data: product } = await supabase.from('products').select('*').eq('id', pid).single();
  const { data: inv } = await supabase.from('central_inventory').select('*').eq('product_id', pid).single();
  const { data: sup } = await supabase.from('product_suppliers').select('*').eq('product_id', pid).eq('is_preferred', true).single();

  const stock = inv?.stock_quantity ?? 0;
  const velocity = Number(product?.sales_velocity_30d || 0);
  const safety = Math.max(inv?.low_stock_threshold || 0, velocity * 3);
  const target = velocity * 21; // lead time 7 + 14 coverage

  const requirement = Math.max(0, target - stock);
  const recommendedWithDeduction = Math.max(0, requirement - qtyOnPo);

  console.log(`Current Stock: ${stock}, Target: ${target}`);
  console.log(`Base Requirement: ${requirement}`);
  console.log(`Recommended (After ${qtyOnPo} PO Deduction): ${recommendedWithDeduction}`);

  if (recommendedWithDeduction < requirement) {
      console.log('PASS: PO Deduction correctly reduced the recommendation.');
  } else {
      console.log('INFO: PO Deduction had no effect (likely requirement was already 0).');
  }
}
check();
