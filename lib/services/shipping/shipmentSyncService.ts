import { supabase } from '../../supabase';
import { Shipment } from '../../types';

export class ShipmentSyncService {
  /**
   * Queue a shipment synchronization event.
   * Inserts into the queue and triggers the shipment-sync-worker edge function
   * to process it server-side (where remote store credentials are available).
   */
  static async queueSync(params: {
    eventType: 'CREATED' | 'STATUS_UPDATE' | 'LABEL_PRINTED' | 'DISPATCHED' | 'DELIVERED';
    shipment: Shipment;
    orderNumber: string;
    storeId: string;
  }): Promise<void> {
    const { eventType, shipment, orderNumber, storeId } = params;

    const payload = {
      shipment_status: shipment.status,
      tracking_number: shipment.tracking_number,
      tracking_url: shipment.tracking_url || `https://www.dhl.com/en-gb/home/tracking.html?tracking-id=${shipment.tracking_number}`,
      shipment_label_url: shipment.label_url,
      shipment_booked_at: shipment.booked_at || shipment.created_at,
      courier_name: 'DHL eCommerce UK',
      carrier: shipment.carrier,
      service_type: shipment.service_type,
      shipment_number: shipment.shipment_number,
      label_printed: shipment.label_printed,
      estimated_delivery: shipment.estimated_delivery,
      actual_delivery: shipment.actual_delivery,
      last_tracking_status: shipment.status,
      sync_updated_at: new Date().toISOString()
    };

    const { data: queueItem, error: queueError } = await supabase
      .from('shipment_sync_queue')
      .insert({
        event_type: eventType,
        store_id: storeId,
        order_number: orderNumber,
        shipment_id: shipment.id,
        payload,
        status: 'pending'
      })
      .select()
      .single();

    if (queueError) {
      console.error('Failed to queue shipment sync:', queueError);
      return;
    }

    // Trigger the shipment-sync-worker edge function to process the queue item server-side.
    // The worker has access to remote store credentials as edge function secrets.
    try {
      const { error: invokeError } = await supabase.functions.invoke('shipment-sync-worker', {});
      if (invokeError) {
        console.error('[shipmentSync] Worker invocation failed (item will be retried by next worker run):', invokeError.message);
      }
    } catch (err) {
      console.error('[shipmentSync] Worker invocation exception (item will be retried):', err);
    }
  }
}
