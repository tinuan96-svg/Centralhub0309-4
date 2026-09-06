import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function find() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, payment_status, order_status, store_id')
    .eq('payment_status', 'paid')
    .limit(100);

  if (error) { console.error(error); return; }
  console.log('Paid Orders:', orders?.length);
  if (orders && orders.length > 0) {
      console.log('Sample Paid Order Statuses:', orders.map(o => o.order_status));
      const unfulfilled = orders.filter(o => !['delivered', 'cancelled', 'refunded', 'completed', 'shipped'].includes(o.order_status));
      console.log('Unfulfilled Paid Orders:', unfulfilled.length);
      if (unfulfilled.length > 0) {
          const { data: items } = await supabase.from('order_items').select('product_name, quantity').eq('order_id', unfulfilled[0].id);
          console.log('Items in first unfulfilled paid order:', items);
      }
  }
}
find();
