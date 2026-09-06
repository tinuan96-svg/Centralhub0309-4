import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Reading table constraints for order_items...');

  const { data: orders } = await supabase.from('orders').select('id').limit(1);
  if (!orders || orders.length === 0) {
      console.log('No orders found to test with.');
      return;
  }

  const validOrderId = orders[0].id;

  const { error } = await supabase.from('order_items').insert({
      order_id: validOrderId,
      product_name: 'Constraint Test',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      product_id: '00000000-0000-0000-0000-000000000001' // Non-existent product
  }).select();

  if (error) {
      console.log('Constraint detected:', error.message);
  } else {
      console.log('No product constraint error.');
  }
}

check();
