import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking database tables...');

  const { data: orders, error: ordersError } = await supabase.from('orders').select('id, order_number').limit(5);
  if (ordersError) {
    console.error('Error fetching orders:', ordersError);
  } else {
    console.log(`Found ${orders?.length || 0} orders.`);
    if (orders && orders.length > 0) {
      console.log('Sample orders:', orders);

      const orderIds = orders.map(o => o.id);
      const { data: items, error: itemsError } = await supabase.from('order_items').select('*').in('order_id', orderIds);

      if (itemsError) {
        console.error('Error fetching items:', itemsError);
      } else {
        console.log(`Found ${items?.length || 0} items for these orders.`);
        if (items && items.length > 0) {
          console.log('Sample items:', items.slice(0, 2));
        }
      }
    }
  }

  // Check total counts
  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: totalItems } = await supabase.from('order_items').select('*', { count: 'exact', head: true });

  console.log(`Total orders in DB: ${totalOrders}`);
  console.log(`Total items in DB: ${totalItems}`);
}

check();
