import { useState, useCallback } from 'react';
import { OrderService } from '../services/orderService';
import { ShippingService } from '../services/shipping/shippingService';
import { ZebraPrintService } from '../services/shipping/zebraPrintService';
import { OrderWithItems, OrderStatus, Store } from '../types';
import { supabase } from '../supabase';

export function useOrderActions(onSuccess?: () => void) {
  const [isActionLoading, setIsActionLoading] = useState(false);

  const handleStatusChange = useCallback(async (id: string, status: OrderStatus) => {
    setIsActionLoading(true);
    try {
      const { success, error } = await OrderService.updateOrderStatus(id, status);
      if (success) {
        onSuccess?.();
      } else {
        alert(`Failed to update status: ${error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  const handleConfirmPayment = useCallback(async (orderId: string) => {
    const reference = prompt('Payment reference (optional):');
    if (reference === null) return;

    setIsActionLoading(true);
    try {
      const { success, orderNumber, error } = await OrderService.confirmPayment(orderId, reference || undefined);
      if (success) {
        alert(`Payment confirmed! Order: ${orderNumber}`);
        onSuccess?.();
      } else {
        alert(`Failed to confirm payment: ${error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const reason = prompt('Cancellation reason (optional):');
    if (reason === null) return;

    setIsActionLoading(true);
    try {
      // 1. Perform cancellation via single atomic service call
      // The backend/DB trigger handles all central_inventory restoration logic.
      // We NEVER touch products.stock directly in frontend.
      const { success, error } = await OrderService.cancelOrder(orderId, reason);

      if (success) {
        onSuccess?.();
      } else {
        // Show clear error message from backend
        alert(`Failed to cancel order: ${error || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error('handleCancelOrder error:', e);
      alert(`Error: ${e.message || 'An unexpected error occurred during cancellation'}`);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  const handleRefundOrder = useCallback(async (orderId: string) => {
    const reason = prompt('Refund reason (optional):');
    if (reason === null) return;
    if (!confirm('Return stock to inventory. Continue?')) return;

    setIsActionLoading(true);
    try {
      const { success, error } = await OrderService.refundOrder(orderId, reason);
      if (success) {
        onSuccess?.();
      } else {
        alert(`Failed to refund order: ${error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (!confirm('PERMANENTLY DELETE this order? This cannot be undone.')) return;

    setIsActionLoading(true);
    try {
      const { success, error } = await OrderService.deleteOrder(orderId);
      if (success) {
        alert('Order deleted successfully');
        onSuccess?.();
      } else {
        alert(`Failed to delete order: ${error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  const handleZebraPrint = useCallback(async (order: OrderWithItems) => {
    try {
      // 1. Check if shipment exists
      const { data: shipment, error: shipError } = await supabase
        .from('shipments')
        .select('*')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shipError || !shipment) {
        alert('No shipment found for this order. Please create a shipment first.');
        return;
      }

      // 2. Generate ZPL
      const zpl = ZebraPrintService.generateLabelZPL({
        orderNumber: order.order_number,
        customerName: order.customer_name,
        address: `${order.delivery_address}, ${order.delivery_city} ${order.delivery_postcode}`,
        trackingNumber: shipment.tracking_number || 'N/A',
        weight: (shipment.weight_grams / 1000).toFixed(2),
        carrier: shipment.carrier || 'DHL'
      });

      // 3. Print
      const result = await ZebraPrintService.printZPL(zpl);
      if (result.success) {
        alert('Label sent to Zebra printer!');
        await ShippingService.markLabelPrinted(shipment.id);
      } else {
        alert(`Print Failed: ${result.error}`);
      }
    } catch (e: any) {
      console.error('Zebra print error:', e);
      alert(`Error: ${e.message}`);
    }
  }, []);

  const handleCreateShipment = useCallback(async (order: OrderWithItems) => {
    setIsActionLoading(true);
    try {
      const weightGrams = (order.items || []).reduce((sum, item) => {
        const itemWeight = (item as any).product?.weight_grams ||
                          ((item as any).product?.weight_kg ? (item as any).product.weight_kg * 1000 : 500);
        return sum + (itemWeight * item.quantity);
      }, 0) || 500;

      const result = await ShippingService.createShipment({
        order_id: order.id,
        carrier: 'dhl',
        service_type: 'standard',
        weight_grams: Math.max(100, weightGrams),
        recipient_name: order.customer_name,
        recipient_address: order.delivery_address,
        recipient_city: order.delivery_city,
        recipient_postcode: order.delivery_postcode,
        recipient_phone: order.customer_phone || '',
        recipient_email: order.customer_email,
      });

      if (result.success) {
        // Auto-print to Zebra after successful creation
        if (confirm('Shipment created! Print label to Zebra ZD421D?')) {
          await handleZebraPrint(order);
        }
        onSuccess?.();
      } else {
        alert(`Failed to create shipment: ${result.error}`);
      }
    } catch (e: any) {
      console.error('handleCreateShipment error:', e);
      alert(`Error: ${e.message || 'An unexpected error occurred'}`);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess, handleZebraPrint]);

  const handlePrintPackingSlip = useCallback((order: OrderWithItems, store?: Store) => {
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Packing Slip — ${order.order_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:13px;}h1{font-size:20px;margin:0 0 4px;}.meta{color:#555;margin-bottom:16px;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:12px;}th{background:#f3f4f6;text-align:left;padding:8px;font-size:12px;}td{padding:8px;border-bottom:1px solid #e5e7eb;}.addr{background:#f9fafb;padding:12px;border-radius:6px;margin:12px 0;}@media print{button{display:none;}}</style>
      </head><body>
      <h1>Packing Slip</h1>
      <div class="meta"><strong>${store?.name || ''}</strong> | ${order.order_number} | ${new Date(order.created_at).toLocaleString('en-GB')}</div>
      <div class="addr"><strong>${order.customer_name}</strong><br/>${order.delivery_address || ''}<br/>${order.delivery_city || ''} ${order.delivery_postcode || ''}<br/>${order.customer_phone || ''}</div>
      <table><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody>
      ${order.items?.map((i) => `<tr><td>${i.product_name}</td><td>${i.quantity}</td></tr>`).join('')}
      </tbody></table>
      <p style="margin-top:24px;font-size:11px;color:#888;">Items: ${order.items?.length || 0} | Total: £${Number(order.total).toFixed(2)}</p>
      <button onclick="window.print()" style="margin-top:16px;padding:8px 16px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;">Print</button>
      </body></html>`);
    win.document.close();
  }, []);

  const handlePrintInvoice = useCallback((order: OrderWithItems, store?: Store) => {
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) return;
    const subtotal = order.items?.reduce((s, i) => s + i.total_price, 0) || 0;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice — ${order.order_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px;}h1{font-size:22px;margin:0 0 4px;}.meta{color:#555;margin-bottom:16px;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:12px;}th{background:#f3f4f6;text-align:left;padding:8px;font-size:12px;}td{padding:8px;border-bottom:1px solid #e5e7eb;}.totals{margin-top:12px;text-align:right;}.totals td{border:none;padding:4px 8px;}@media print{button{display:none;}}</style>
      </head><body>
      <h1>Invoice</h1>
      <div class="meta"><strong>${store?.name || ''}</strong> | ${order.order_number} | ${new Date(order.created_at).toLocaleString('en-GB')}</div>
      <p><strong>Bill To:</strong><br/>${order.customer_name}<br/>${order.customer_email || ''}<br/>${order.customer_phone || ''}<br/>${order.delivery_address || ''}, ${order.delivery_city || ''} ${order.delivery_postcode || ''}</p>
      <table><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>
      ${order.items?.map((i) => `<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>£${Number(i.unit_price).toFixed(2)}</td><td>£${Number(i.total_price).toFixed(2)}</td></tr>`).join('')}
      </tbody></table>
      <table class="totals" style="width:280px;margin-left:auto;margin-top:16px;">
      <tr><td>Subtotal</td><td>£${subtotal.toFixed(2)}</td></tr>
      <tr><td>Delivery</td><td>£${Number((order as any).delivery_fee || 0).toFixed(2)}</td></tr>
      <tr style="font-weight:bold;font-size:14px;"><td>Total</td><td>£${Number(order.total).toFixed(2)}</td></tr>
      </table>
      <button onclick="window.print()" style="margin-top:16px;padding:8px 16px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;">Print</button>
      </body></html>`);
    win.document.close();
  }, []);

  const handleRefreshFromSource = useCallback(async (orderId: string) => {
    setIsActionLoading(true);
    try {
      const { success, error } = await OrderService.syncOrderFromSource(orderId);
      if (success) {
        onSuccess?.();
      } else {
        alert(`Failed to sync from source: ${error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  }, [onSuccess]);

  return {
    isActionLoading,
    handleStatusChange,
    handleConfirmPayment,
    handleCancelOrder,
    handleRefundOrder,
    handleDeleteOrder,
    handleCreateShipment,
    handleZebraPrint,
    handlePrintPackingSlip,
    handlePrintInvoice,
    handleRefreshFromSource,
  };
}
