import { supabase } from '../supabase';

/**
 * Pushes an order status update to the remote store via the update-order-status edge function.
 * This is a fire-and-forget call — errors are logged but never thrown, so the caller's
 * local operation is never blocked by a remote sync failure.
 */
export async function pushOrderStatusToStore(
  orderId: string,
  status: string,
  notes?: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('update-order-status', {
      body: { orderId, status, notes },
    });
    if (error) {
      console.error(`[orderStatusSync] Failed to push status "${status}" for order ${orderId}:`, error.message);
    }
  } catch (err) {
    console.error(`[orderStatusSync] Exception pushing status "${status}" for order ${orderId}:`, err);
  }
}
