import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runTest() {
  console.log('🧪 Starting Order Cancellation & Stock Restoration Test...');

  const TEST_PRODUCT_SKU = 'TEST-CANCEL-SKU';
  const TEST_ORDER_NUMBER = 'TEST-ORD-CANCEL';

  try {
    // 1. Setup Test Product
    console.log('1. Setting up test product...');
    const { data: product, error: prodError } = await supabase.from('products').upsert({
      name: 'TEST_CANCEL_PRODUCT',
      sku: TEST_PRODUCT_SKU,
      price: 10.00,
      cost_price: 5.00,
      is_active: true,
      is_deleted: false
    }, { onConflict: 'sku' }).select().single();

    if (prodError) throw prodError;

    // Initialize stock
    await supabase.from('central_inventory').upsert({
      product_id: product.id,
      stock_quantity: 100,
      reserved_quantity: 0
    }, { onConflict: 'product_id' });

    console.log('✅ Test product ready (Stock: 100)');

    // 2. Create Test Order
    console.log('2. Creating test order...');
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      order_number: TEST_ORDER_NUMBER,
      payment_status: 'pending',
      order_status: 'pending_payment',
      total: 50.00,
      delivery_fee: 0,
      stock_deducted: false
    }).select().single();

    if (orderError) throw orderError;

    // Add order item
    await supabase.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      product_name: 'TEST_CANCEL_PRODUCT',
      quantity: 5,
      unit_price: 10.00,
      total_price: 50.00,
      cost_price: 5.00
    });

    console.log('✅ Test order created (Qty: 5)');

    // 3. Simulate Payment (Triggers Deduction)
    console.log('3. Simulating payment (deducting stock)...');
    const { error: payError } = await supabase.from('orders').update({
      payment_status: 'paid',
      order_status: 'confirmed'
    }).eq('id', order.id);

    if (payError) throw payError;

    // Verify stock deduction
    const { data: stockAfterPay } = await supabase.from('central_inventory').select('stock_quantity').eq('product_id', product.id).single();
    if (stockAfterPay?.stock_quantity !== 95) {
      throw new Error(`Deduction failed! Expected 95, got ${stockAfterPay?.stock_quantity}`);
    }
    console.log('✅ Stock deducted correctly (Current: 95)');

    // 4. Simulate Cancellation (Triggers Restoration)
    console.log('4. Simulating cancellation (restoring stock)...');
    const { error: cancelError } = await supabase.from('orders').update({
      order_status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', order.id);

    if (cancelError) throw cancelError;

    // Verify stock restoration
    const { data: stockAfterCancel } = await supabase.from('central_inventory').select('stock_quantity').eq('product_id', product.id).single();
    if (stockAfterCancel?.stock_quantity !== 100) {
      throw new Error(`Restoration failed! Expected 100, got ${stockAfterCancel?.stock_quantity}`);
    }
    console.log('✅ Stock restored correctly (Current: 100)');

    // 5. Test Idempotency (Repeat Cancellation)
    console.log('5. Testing idempotency (second cancellation)...');
    await supabase.from('orders').update({
      order_status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', order.id);

    const { data: stockAfterRepeat } = await supabase.from('central_inventory').select('stock_quantity').eq('product_id', product.id).single();
    if (stockAfterRepeat?.stock_quantity !== 100) {
      throw new Error(`Idempotency failed! Double restoration occurred!`);
    }
    console.log('✅ Idempotency verified');

    console.log('\n✨ ALL TESTS PASSED ✨');

  } catch (err: any) {
    console.error('\n❌ TEST FAILED:', err.message);
  } finally {
     // Cleanup
     console.log('Cleaning up...');
     // Find and delete the product and order
     const { data: p } = await supabase.from('products').select('id').eq('sku', TEST_PRODUCT_SKU).maybeSingle();
     if (p) {
       await supabase.from('order_items').delete().eq('product_id', p.id);
       await supabase.from('orders').delete().eq('order_number', TEST_ORDER_NUMBER);
       await supabase.from('central_inventory').delete().eq('product_id', p.id);
       await supabase.from('products').delete().eq('id', p.id);
     }
     console.log('Done.');
  }
}

runTest();
