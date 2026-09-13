import { supabase } from '../supabase';

/**
 * Customer-facing order lifecycle is canonical across CentralHub and every store.
 * Internal/legacy shipment states are normalized before a remote store receives them.
 */
function canonicalRemoteStatus(status: string): string {
  switch (status) {
    case 'packed':
      return 'ready_to_ship';
    case 'collected':
    case 'in_transit':
      return 'shipped';
    default:
      return status;
  }
}

/**
 * Pushes an order status update to the remote store via the update-order-status edge function.
 * Errors are logged but never thrown, so a temporary remote-store problem cannot roll back the
 * warehouse action. CentralHub's database-level sync remains the durable source of truth.
 */
export async function pushOrderStatusToStore(
  orderId: string,
  status: string,
  notes?: string
): Promise<void> {
  const remoteStatus = canonicalRemoteStatus(status);

  try {
    const { error } = await supabase.functions.invoke('update-order-status', {
      body: { orderId, status: remoteStatus, notes },
    });
    if (error) {
      console.error(`[orderStatusSync] Failed to push status "${remoteStatus}" for order ${orderId}:`, error.message);
    }
  } catch (err) {
    console.error(`[orderStatusSync] Exception pushing status "${remoteStatus}" for order ${orderId}:`, err);
  }
}
