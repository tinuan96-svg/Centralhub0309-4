import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAnalytics() {
  console.log("--- Reconciling Intelligence Totals ---\n");

  // 1. Get raw order totals (validated revenue definition)
  const { data: rawOrders } = await supabase
    .from('orders')
    .select('id, total, delivery_fee')
    .eq('payment_status', 'paid')
    .not('order_status', 'in', '("cancelled","refunded")');

  const totalRawRevenue = (rawOrders || []).reduce((sum, o) => sum + (Number(o.total) - Number(o.delivery_fee)), 0);
  console.log(`- Authoritative Raw Revenue (Paid - Delivery): £${totalRawRevenue.toLocaleString()}`);

  // 2. Aggregate from order_items (the basis of brand/category intelligence)
  const orderIds = (rawOrders || []).map(o => o.id);
  const { data: rawItems } = await supabase
    .from('order_items')
    .select('total_price')
    .in('order_id', orderIds);

  const totalItemsRevenue = (rawItems || []).reduce((sum, i) => sum + Number(i.total_price), 0);
  console.log(`- Aggregated Order Items Revenue: £${totalItemsRevenue.toLocaleString()}`);

  const diff = Math.abs(totalRawRevenue - totalItemsRevenue);
  if (diff > 1) {
    console.warn(`\n⚠️ DISCREPANCY DETECTED: £${diff.toLocaleString()}`);
    console.warn("Possible reasons: orders without items, manual adjustments, or rounding errors.");
  } else {
    console.log("\n✅ RECONCILIATION SUCCESSFUL: Transactional data matches aggregation layer.");
  }

  // 3. Brand coverage
  const { data: productsWithBrands } = await supabase.from('products').select('id, brand_id').is('is_deleted', false);
  const unassignedBrands = (productsWithBrands || []).filter(p => !p.brand_id).length;
  console.log(`\n- Data Quality: ${unassignedBrands} active products have NO brand assignment.`);

  console.log("\n--- Verification Complete ---");
}

verifyAnalytics().catch(console.error);
