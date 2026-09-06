import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const centralHubSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const malluSupabase = createClient(
  process.env.MALLUSPICES_SUPABASE_URL!,
  process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const orderNumber = 'MS-022270';
  console.log(`Diagnostic sync for order ${orderNumber}...`);

  // 1. Find the order on MalluSpices
  const { data: remoteOrders } = await malluSupabase
    .from('orders')
    .select('*')
    .ilike('order_number', `%${orderNumber}%`)
    .limit(1);

  if (!remoteOrders || remoteOrders.length === 0) {
      console.log('Order not found on MalluSpices!');
      return;
  }

  const remoteOrder = remoteOrders[0];
  console.log('Remote order found. ID:', remoteOrder.id);

  // 2. Find items on MalluSpices
  let remoteItems: any[] = [];
  const tableNames = ["order_items", "items", "line_items"];
  for (const table of tableNames) {
      const { data } = await malluSupabase.from(table).select('*').eq('order_id', remoteOrder.id);
      if (data && data.length > 0) {
          remoteItems = data;
          console.log(`Found ${data.length} items in ${table} on MalluSpices`);
          break;
      }
  }

  if (remoteItems.length === 0) {
      console.log('No items found for this order on MalluSpices.');
      return;
  }

  // 3. Upsert into CentralHub
  console.log('Upserting into CentralHub...');

  // Map items
  const localItems = remoteItems.map((item, idx) => ({
      id: item.id || `${remoteOrder.id}-${idx}`,
      order_id: remoteOrder.id,
      product_id: item.product_id || item.productid || null,
      product_name: item.product_name || item.name || 'Item',
      quantity: Number(item.quantity || item.qty || 1),
      unit_price: Number(item.unit_price || item.price || 0),
      total_price: Number(item.total_price || (Number(item.quantity || 1) * Number(item.unit_price || 0))),
  }));

  const { error: itemsError } = await centralHubSupabase.from('order_items').upsert(localItems);
  if (itemsError) {
      console.error('FAILED to upsert items into CentralHub:', itemsError.message);
  } else {
      console.log('SUCCESS! Upserted items into CentralHub');
  }

  // 4. Verify in CentralHub
  const { data: verifyItems } = await centralHubSupabase.from('order_items').select('*').eq('order_id', remoteOrder.id);
  console.log(`Verification: Found ${verifyItems?.length || 0} items in CentralHub for order_id ${remoteOrder.id}`);
}

run();
