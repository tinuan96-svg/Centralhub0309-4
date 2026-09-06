import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const malluSupabase = createClient(
  process.env.MALLUSPICES_SUPABASE_URL!,
  process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const orderNumber = 'MS-022271';
  console.log(`Diagnostic for MalluSpices order ${orderNumber}...`);

  const { data: orders } = await malluSupabase
    .from('orders')
    .select('*, order_items(*)')
    .ilike('order_number', `%${orderNumber}%`)
    .limit(1);

  if (!orders || orders.length === 0) {
      console.log('Order not found!');
      return;
  }

  const order = orders[0];
  console.log('Order ID:', order.id);
  console.log('JSON items count:', Array.isArray(order.items) ? order.items.length : 'none');
  console.log('Relation order_items count:', Array.isArray(order.order_items) ? order.order_items.length : 'none');

  if (order.order_items && order.order_items.length > 0) {
      console.log('Sample item:', order.order_items[0]);
  }
}

check();
