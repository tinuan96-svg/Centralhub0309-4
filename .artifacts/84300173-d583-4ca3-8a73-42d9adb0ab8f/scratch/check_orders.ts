import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: orders, error } = await supabase.from('orders').select('payment_status, order_status').limit(1000);
  if (error) { console.error(error); return; }

  const statusMap: any = {};
  const paymentMap: any = {};

  orders?.forEach(o => {
    statusMap[o.order_status] = (statusMap[o.order_status] || 0) + 1;
    paymentMap[o.payment_status] = (paymentMap[o.payment_status] || 0) + 1;
  });

  console.log('Order Status Counts:', statusMap);
  console.log('Payment Status Counts:', paymentMap);

  const unfulfilledPaid = orders?.filter(o => o.payment_status === 'paid' && !['delivered', 'cancelled', 'refunded', 'completed', 'shipped'].includes(o.order_status));
  console.log('Unfulfilled Paid Orders Count:', unfulfilledPaid?.length);
}
check();
