import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  console.log('Stores:', stores);

  const { data: orders } = await supabase.from('orders').select('id, store_id, order_number').limit(10);
  console.log('Sample Orders:', orders);

  const { data: storeCounts } = await supabase.rpc('get_order_counts_by_store');
  // If RPC doesn't exist, we'll do it manually
  if (!storeCounts) {
      const counts: any = {};
      const { data: allOrders } = await supabase.from('orders').select('store_id');
      allOrders?.forEach(o => {
          counts[o.store_id] = (counts[o.store_id] || 0) + 1;
      });
      console.log('Order counts by store_id:', counts);
  } else {
      console.log('Store counts from RPC:', storeCounts);
  }
}

check();
