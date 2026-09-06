import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function check() {
  const url = process.env.MALLUSPICES_SUPABASE_URL;
  const key = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('MalluSpices credentials missing in .env');
    return;
  }

  console.log('Connecting to MalluSpices...');
  const remoteSupabase = createClient(url, key);

  // 1. Get a sample order
  const { data: orders, error: ordersError } = await remoteSupabase
    .from('orders')
    .select('*')
    .limit(1);

  if (ordersError) {
    console.error('Error fetching MalluSpices orders:', ordersError);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('No orders found in MalluSpices');
    return;
  }

  const order = orders[0];
  console.log('Sample Order ID:', order.id);
  console.log('Order columns:', Object.keys(order));

  if (order.items) {
      console.log('Order has "items" column (JSON style)');
      console.log('Items content:', order.items);
  }

  // 2. Try common item tables
  const tableNames = ["order_items", "items", "line_items", "ordered_products", "order_details"];
  for (const tableName of tableNames) {
    const { data: items, error } = await remoteSupabase
      .from(tableName)
      .select('*')
      .eq('order_id', order.id);

    if (!error) {
      console.log(`✅ Table found: ${tableName}. Found ${items?.length || 0} items for order ${order.id}`);
      if (items && items.length > 0) {
        console.log('Sample item columns:', Object.keys(items[0]));
      }
    } else {
      console.log(`❌ Table check failed for ${tableName}: ${error.message}`);
    }
  }
}

check();
