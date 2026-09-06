import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const centralHubSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const kgSupabase = createClient(
  process.env.SOURCE3_SUPABASE_URL!,
  process.env.SOURCE3_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('Fetching KeralaGrocery orders and items...');

  const { data: store } = await centralHubSupabase.from('stores').select('id').eq('slug', 'keralagroceries').single();
  if (!store) {
    console.error('KeralaGrocery store not found in CentralHub');
    return;
  }

  const { data: remoteOrders, error: ordersError } = await kgSupabase.from('orders').select('*');
  if (ordersError) {
    console.error('Error fetching remote orders:', ordersError);
    return;
  }

  console.log(`Found ${remoteOrders?.length || 0} orders in KeralaGrocery`);

  for (const remoteOrder of remoteOrders || []) {
    console.log(`Syncing order ${remoteOrder.order_number}...`);

    // Map order data
    const centralOrder = {
        id: remoteOrder.id,
        order_number: remoteOrder.order_number,
        customer_name: remoteOrder.customer_name || 'Guest',
        customer_email: remoteOrder.customer_email || '',
        customer_phone: remoteOrder.customer_phone || '',
        delivery_address: remoteOrder.delivery_address || '',
        delivery_city: remoteOrder.delivery_city || '',
        delivery_postcode: remoteOrder.delivery_postcode || '',
        subtotal: remoteOrder.subtotal || 0,
        delivery_fee: remoteOrder.delivery_fee || 0,
        total: remoteOrder.total || 0,
        payment_method: remoteOrder.payment_method || 'card',
        payment_status: remoteOrder.payment_status || 'pending',
        order_status: remoteOrder.order_status || remoteOrder.status || 'pending',
        created_at: remoteOrder.created_at,
        updated_at: remoteOrder.updated_at,
        store_id: store.id,
        inventory_sync_status: 'synced'
    };

    await centralHubSupabase.from('orders').upsert(centralOrder, { onConflict: 'id' });

    // Fetch items
    const { data: remoteItems } = await kgSupabase
        .from('order_items')
        .select('*')
        .eq('order_id', remoteOrder.id);

    if (remoteItems && remoteItems.length > 0) {
        console.log(`  -> Found ${remoteItems.length} items`);
        const localItems = remoteItems.map((item: any) => ({
            id: item.id,
            order_id: remoteOrder.id,
            product_id: item.product_id,
            product_name: item.product_name || item.name || 'Item',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || item.price || 0,
            total_price: item.total_price || ((item.quantity || 1) * (item.unit_price || item.price || 0)),
            product_image: item.product_image || item.image_url || null
        }));

        const { error: itemsError } = await centralHubSupabase.from('order_items').upsert(localItems, { onConflict: 'id' });
        if (itemsError) console.error(`    !! Items error:`, itemsError.message);
    } else {
        console.log(`  -> No items found in order_items table, checking items table...`);
        const { data: altItems } = await kgSupabase.from('items').select('*').eq('order_id', remoteOrder.id);
        if (altItems && altItems.length > 0) {
            console.log(`  -> Found ${altItems.length} items in alt table`);
            // ... map alt items ...
        }
    }
  }

  console.log('Sync completed.');
}

run();
