import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Checking IDs in CentralHub...');

  const { data: orders } = await supabase.from('orders').select('id, order_number').limit(10);
  console.log('Orders sample:', orders?.map(o => ({ id: o.id, no: o.order_number })));

  if (orders && orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    console.log('Searching for items with order_ids:', orderIds);

    // Try to find ANY items first to see what order_id looks like there
    const { data: anyItems } = await supabase.from('order_items').select('order_id, product_name').limit(5);
    console.log('Any items sample (order_id):', anyItems?.map(i => i.order_id));

    const { data: matchingItems } = await supabase
      .from('order_items')
      .select('order_id, product_name')
      .in('order_id', orderIds);

    console.log(`Found ${matchingItems?.length || 0} items matching these orders`);
  }
}

check();
