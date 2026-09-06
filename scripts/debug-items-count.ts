import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Checking order_items in CentralHub...');

  const { count, error: countError } = await supabase
    .from('order_items')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error counting items:', countError);
  } else {
    console.log(`Total rows in order_items: ${count}`);
  }

  const { data: firstItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .limit(5);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
  } else {
    console.log('Sample items:', JSON.stringify(firstItems, null, 2));
  }

  const { data: firstOrders } = await supabase.from('orders').select('id, order_number').limit(5);
  for (const order of firstOrders || []) {
    const { count: orderItemsCount } = await supabase
        .from('order_items')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', order.id);
    console.log(`Order ${order.order_number} (${order.id}) has ${orderItemsCount} items`);
  }
}

check();
