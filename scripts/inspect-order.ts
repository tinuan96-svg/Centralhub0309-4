import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect(orderNumber: string) {
  console.log(`Inspecting order: ${orderNumber}`);

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .single();

  if (error || !order) {
    console.error('Order not found', error);
    return;
  }

  console.log('Order ID:', order.id);
  console.log('Store ID:', order.store_id);

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
  } else {
    console.log(`Found ${items?.length || 0} items locally.`);
    if (items && items.length > 0) {
      console.log('Items:', items);
    }
  }
}

inspect('MS-822278');
