import { NextResponse } from 'next/server';
import { ShippingService } from '@/lib/services/shipping/shippingService';
import { ShipmentSyncService } from '@/lib/services/shipping/shipmentSyncService';
import { supabase } from '@/lib/supabase';
import { verifyHmacSignature } from '@/lib/utils/webhook-verification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const body = await request.text();
  const signature = request.headers.get('x-dhl-signature');
  const secret = process.env.DHL_WEBHOOK_SECRET;

  // SECURITY: Verify webhook signature
  if (secret && signature) {
    const isValid = verifyHmacSignature(body, signature, secret);
    if (!isValid) {
      console.warn('Invalid DHL Webhook signature');
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
    }
  } else if (secret && !signature) {
    console.warn('Missing DHL Webhook signature');
    return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    console.log('Received DHL Webhook:', JSON.stringify(payload));

    // DHL eCommerce UK webhook format usually sends shipmentId and a status code
    const trackingNumber = payload.shipmentId || payload.trackingNumber;

    if (!trackingNumber) {
      return NextResponse.json({ success: false, error: 'No tracking number in payload' }, { status: 400 });
    }

    // Find the shipment in our database
    const { data: shipment, error: shipError } = await supabase
      .from('shipments')
      .select('*, orders(order_number, store_id)')
      .eq('tracking_number', trackingNumber)
      .single();

    if (shipError || !shipment) {
      return NextResponse.json({ success: true, message: 'Shipment not found in local DB, ignored.' });
    }

    // 1. Refresh from tracking API
    await ShippingService.trackShipment(shipment.id);

    // 2. Fetch updated shipment data
    const { data: updatedShipment } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', shipment.id)
      .single();

    // 3. Queue sync back to store
    if (updatedShipment && shipment.orders) {
      await ShipmentSyncService.queueSync({
        eventType: 'STATUS_UPDATE',
        shipment: updatedShipment as any,
        orderNumber: shipment.orders.order_number,
        storeId: shipment.orders.store_id
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DHL Webhook Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
