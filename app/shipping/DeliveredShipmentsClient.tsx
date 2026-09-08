'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Truck } from 'lucide-react';
import { FulfillmentService, type FulfillmentOrder } from '@/lib/services/fulfillmentService';

function moneyFromPence(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `£${(n / 100).toFixed(2)}` : '—';
}

export default function DeliveredShipmentsClient() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const rows = await FulfillmentService.getOrdersReadyForShipping();
    setOrders(rows);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const delivered = useMemo(() => orders.filter((order: any) => {
    const orderStatus = String(order.order_status || order.fulfillment_status || '').toLowerCase();
    const shipmentStatus = String(order.shipment?.status || '').toLowerCase();
    return ['delivered', 'completed'].includes(orderStatus) || shipmentStatus === 'delivered';
  }), [orders]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Delivered shipment history
          </div>
          <p className="mt-1 text-xs text-slate-400">Payment-received orders only. Shipment costs shown are the reconciled DHL values where available.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Shipment / Tracking</th>
                <th className="px-4 py-3">Actual DHL cost</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading delivered shipments…</td></tr>
              ) : delivered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No delivered payment-received shipments found.</td></tr>
              ) : delivered.map((order: any) => (
                <tr key={order.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-semibold text-slate-100">{order.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{order.customer_name || 'Customer'}</div>
                    <div className="text-xs text-slate-500">{order.customer_email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.delivery_postcode || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-300"><Truck className="h-4 w-4" /> {order.shipment?.shipment_number || '—'}</div>
                    <div className="mt-1 text-xs text-slate-500">{order.shipment?.tracking_number || 'No tracking number'}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-100">{moneyFromPence(order.shipment?.shipping_cost)}</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">Delivered</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
