import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Checking column types in CentralHub...');

  // We'll use a trick to get error message that reveals types if we can
  // or use RPC if enabled.
  // Since we can't easily get metadata, we'll try to insert a wrong type.

  const { data: orders, error: ordersError } = await supabase.from('orders').select('*').limit(1);
  if (orders && orders.length > 0) {
      console.log('Order ID type check:', typeof orders[0].id, orders[0].id);
  } else {
      console.log('No orders found or error:', ordersError);
  }

  const { data: items, error: itemsError } = await supabase.from('order_items').select('*').limit(1);
  if (items && items.length > 0) {
      console.log('OrderItem ID type check:', typeof items[0].id, items[0].id);
      console.log('OrderItem order_id type check:', typeof items[0].order_id, items[0].order_id);
  } else {
      console.log('No order items found or error:', itemsError);
  }
}

check();
