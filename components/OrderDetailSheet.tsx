'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { OrderWithItems, OrderStatus, Store } from '@/lib/types';
import StoreBadge from '@/components/StoreBadge';
import { OrderService } from '@/lib/services/orderService';
import { supabase as supabaseClient } from '@/lib/supabase';

const STATUS_STYLES: Record<string, string> = {
  pending_payment:    'bg-slate-800 text-slate-400 border-slate-700',
  confirmed:          'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  picking:            'bg-blue-900/40 text-blue-300 border-blue-700/40',
  packing:            'bg-orange-900/40 text-orange-300 border-orange-700/40',
  packed:             'bg-amber-900/40 text-amber-300 border-amber-700/40',
  ready_to_ship:      'bg-teal-900/40 text-teal-300 border-teal-700/40',
  shipment_booked:    'bg-indigo-900/40 text-indigo-300 border-indigo-700/40',
  collected:          'bg-blue-800/40 text-blue-200 border-blue-600/40',
  shipped:            'bg-violet-900/40 text-violet-300 border-violet-700/40',
  at_local_depot:     'bg-indigo-800/40 text-indigo-200 border-indigo-600/40',
  out_for_delivery:   'bg-sky-900/40 text-sky-300 border-sky-700/40',
  delivered:          'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  completed:          'bg-green-900/40 text-green-300 border-green-700/40',
  cancelled:          'bg-red-900/40 text-red-300 border-red-700/40',
  refunded:           'bg-slate-700/60 text-slate-300 border-slate-600/40',
  delivery_attempted: 'bg-amber-800/40 text-amber-200 border-amber-600/40',
  ready_for_collection: 'bg-purple-800/40 text-purple-200 border-purple-600/40',
  delivery_rescheduled: 'bg-cyan-800/40 text-cyan-200 border-cyan-600/40',
  returned:           'bg-rose-800/40 text-rose-200 border-rose-600/40',
  failed:             'bg-rose-900/40 text-rose-300 border-rose-700/40',
};

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'confirmed',
  'picking',
  'picked',
  'packing',
  'packed',
  'ready_to_ship',
  'shipment_booked',
  'collected',
  'shipped',
  'at_local_depot',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'delivery_attempted',
  'ready_for_collection',
  'delivery_rescheduled',
  'returned',
  'failed'
];

function fmt(p: number | string | undefined | null) {
  const val = Number(p);
  return `£${isNaN(val) ? '0.00' : val.toFixed(2)}`;
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

function StatusSheet({
  current,
  onSelect,
  onClose,
}: {
  current: OrderStatus;
  onSelect: (s: OrderStatus) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[110] flex items-end justify-center md:items-center p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full md:max-w-md bg-slate-900 border-t md:border border-slate-700/60 rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ maxHeight: '80dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Change Status</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { onSelect(s); onClose(); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                s === current
                  ? `${STATUS_STYLES[s]} border-opacity-100 shadow-lg shadow-black/20`
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 hover:border-slate-600/50'
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider">{s.replace(/_/g, ' ')}</span>
              {s === current && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="h-4 flex-shrink-0 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

export default function OrderDetailSheet({
  order,
  store,
  onClose,
  onStatusChange,
  onConfirmPayment,
  onCancel,
  onRefund,
  onDelete,
  onPrintSlip,
  onPrintInvoice,
  onCreateShipment,
  onZebraPrint,
  onRefreshFromSource,
  isActionLoading,
}: {
  order: OrderWithItems;
  store?: Store;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
  onConfirmPayment: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void> | void;
  onRefund: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onPrintSlip: (order: OrderWithItems) => void;
  onPrintInvoice: (order: OrderWithItems) => void;
  onCreateShipment: (order: OrderWithItems) => Promise<void>;
  onZebraPrint?: (order: OrderWithItems) => Promise<void>;
  onRefreshFromSource?: (order: OrderWithItems) => Promise<void>;
  isActionLoading?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);
  const [isZebraPrinting, setIsZebraPrinting] = useState(false);
  const [isStartingPicking, setIsStartingPicking] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order.order_status);
  const [history, setHistory] = useState<any[]>([]);
  const router = useRouter();

  const loadHistory = useCallback(async () => {
    try {
      if (!supabaseClient) {
        console.error('Supabase client not initialized');
        return;
      }

      const [statusHistory, shipments] = await Promise.all([
        OrderService.getOrderStatusHistory(order.id),
        supabaseClient.from('shipments').select('id, tracking_number').eq('order_id', order.id)
      ]);

      let combinedHistory: any[] = (statusHistory || []).map(h => ({
        ...h,
        timestamp: h.created_at,
        label: h.new_status?.replace(/_/g, ' '),
        type: 'status'
      }));

      // If there are shipments, get their events too
      if (shipments.data && shipments.data.length > 0) {
        const shipmentIds = shipments.data.map(s => s.id);
        const { data: shipmentEvents } = await supabaseClient
          .from('shipment_events')
          .select('*')
          .in('shipment_id', shipmentIds);

        if (shipmentEvents) {
          const mappedShipmentEvents = shipmentEvents.map(e => ({
            id: e.id,
            timestamp: e.event_time,
            label: e.description || e.status?.replace(/_/g, ' '),
            notes: e.location ? `Location: ${e.location}` : undefined,
            type: 'shipment',
            created_by: 'Courier'
          }));
          combinedHistory = [...combinedHistory, ...mappedShipmentEvents];
        }
      }

      // Sort by timestamp descending
      combinedHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setHistory(combinedHistory);
    } catch (e) {
      console.error('Error loading history:', e);
    }
  }, [order.id]);

  useEffect(() => {
    setCurrentStatus(order.order_status);
    loadHistory();
  }, [order.id, order.order_status, loadHistory]);

  const productRevenue = (Number(order.total) || 0) - (Number(order.delivery_fee) || 0);
  const totalCost = order.items?.reduce((s, i) => s + (Number(i.cost_price) || 0) * i.quantity, 0) || 0;
  const profit = productRevenue - totalCost;
  const profitMargin = productRevenue > 0 ? (profit / productRevenue) * 100 : 0;
  const hasIncompleteCosts = order.items?.some(i => i.cost_price === null) || false;

  const handleStatusSelect = async (s: OrderStatus) => {
    if (s === currentStatus) return;
    setSavingStatus(true);
    setCurrentStatus(s);
    await onStatusChange(order.id, s);
    setSavingStatus(false);
  };

  const handleRefresh = async () => {
    if (!onRefreshFromSource) return;
    setIsRefreshing(true);
    await onRefreshFromSource(order);
    setIsRefreshing(false);
  };

  const handleStartPicking = async () => {
    setIsStartingPicking(true);
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient
        .from('orders')
        .update({
          order_status: 'picking',
          picking_started_at: new Date().toISOString(),
          picked_by_user: user?.id,
          locked_by: user?.id,
          locked_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      onClose();
      router.push(`/picking/active?id=${order.id}`);
    } catch (e) {
      console.error('Error starting picking:', e);
    } finally {
      setIsStartingPicking(false);
    }
  };

  const { date, time } = fmtDate(order.created_at);

  if (!mounted) return null;

  // Render outside the app shell so sidebar stacking and transformed ancestors
  // cannot cover or offset the order dialog in Android WebView.
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/75 z-[100] flex items-end md:items-center justify-center"
        style={{ padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)' }}
        onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Order ${order.order_number}`}
          className="bg-slate-900 min-w-0 max-w-full overflow-hidden w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl border border-slate-700/60 shadow-2xl flex flex-col"
          style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 flex-shrink-0 pt-safe-top">
            <div className="flex items-center gap-3 min-w-0">
              {store && <StoreBadge store={store} size="sm" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white font-mono truncate">{order.order_number}</p>
                <p className="text-xs text-slate-400">{date} {time}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onRefreshFromSource && (
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
                  title="Refresh from source website"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              <button onClick={onClose} aria-label="Close order details" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white flex-shrink-0 ml-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [overflow-wrap:anywhere]">
            <div className="p-4 space-y-4">

              {/* Status + payment row */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowStatusSheet(true)}
                  disabled={savingStatus}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl border transition-colors ${STATUS_STYLES[currentStatus] || ''}`}
                >
                  <div className="text-left">
                    <p className="text-[10px] font-medium opacity-70 mb-0.5">Order Status</p>
                    <p className="text-sm font-bold capitalize flex items-center gap-1.5">
                      {savingStatus && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      {currentStatus}
                    </p>
                  </div>
                  <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={`flex items-center px-3 py-3 rounded-xl border ${STATUS_STYLES[order.payment_status] || ''}`}>
                  <div>
                    <p className="text-[10px] font-medium opacity-70 mb-0.5">Payment</p>
                    <p className="text-sm font-bold capitalize">{order.payment_status}</p>
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Order Total</p>
                  <p className="text-lg font-bold text-cyan-400">{fmt(order.total)}</p>
                </div>
                <div className={`${profit >= 0 ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-rose-900/20 border-rose-700/30'} border rounded-xl px-3 py-3`}>
                  <p className="text-[10px] text-slate-500 mb-1 flex items-center justify-between">
                    Profit
                    {hasIncompleteCosts && <span className="text-[8px] text-amber-500" title="Some costs missing">*</span>}
                  </p>
                  <p className={`text-lg font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmt(profit)} <span className="text-xs font-medium opacity-70">({profitMargin.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              {/* Customer */}
              <section>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer</h3>
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-white">{order.customer_name}</p>
                  {order.customer_email && <p className="text-sm text-slate-300">{order.customer_email}</p>}
                  {order.customer_phone && <p className="text-sm text-slate-300">{order.customer_phone}</p>}
                  {order.notes && (
                    <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
                      <p className="text-xs text-yellow-300">Note: {order.notes}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Delivery */}
              <section>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Delivery Address</h3>
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3 space-y-0.5">
                  {order.delivery_address && <p className="text-sm text-slate-200">{order.delivery_address}</p>}
                  {order.delivery_city && <p className="text-sm text-slate-200">{order.delivery_city}</p>}
                  {order.delivery_postcode && <p className="text-sm font-mono text-slate-300">{order.delivery_postcode}</p>}
                  {!order.delivery_address && !order.delivery_city && (
                    <p className="text-sm text-slate-500">No address on file</p>
                  )}
                </div>
              </section>

              {/* Order items */}
              <section>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items ({order.items?.length || 0})</h3>
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl divide-y divide-slate-700/40">
                  {order.items?.map((item, idx) => (
                    <div key={item.id || `item-${idx}`} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {item.product_image && (
                          <img src={item.product_image} alt={item.product_name} className="w-10 h-10 rounded-lg object-cover bg-slate-700 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-100">{item.product_name}</p>
                          {(item.brand || item.weight || item.unit) && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.brand && <span className="text-slate-400">{item.brand}</span>}
                              {item.brand && (item.weight || item.unit) && <span className="text-slate-600 mx-1">·</span>}
                              {item.weight && <span>{item.weight} {item.unit || ''}</span>}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-slate-400">Qty: <span className="text-slate-200 font-semibold">{item.quantity}</span></span>
                            <span className="text-xs text-slate-400">{fmt(item.unit_price)} each</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-bold text-white">{fmt(item.total_price)}</p>
                          {item.cost_price != null && (
                            <p className="text-xs text-slate-500">Cost: {fmt(item.cost_price * item.quantity)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {order.items?.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-slate-500">No items found for this order.</p>
                      <button
                        onClick={handleRefresh}
                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                      >
                        Try refreshing from source
                      </button>
                    </div>
                  )}

                  {/* Subtotal rows */}
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm text-slate-400">
                      <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
                    </div>
                    {Number(order.delivery_fee) > 0 && (
                      <div className="flex justify-between text-sm text-slate-400">
                        <span>Delivery</span><span>{fmt(order.delivery_fee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-amber-400 border-t border-slate-700 pt-1.5">
                      <span>Total</span><span>{fmt(order.total)}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Order metadata */}
              <section>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Order Details</h3>
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl divide-y divide-slate-700/40">
                  {[
                    { label: 'Fulfillment', value: (order as any).fulfillment_status || '—' },
                    { label: 'Warehouse', value: (order as any).warehouse_status || '—' },
                    { label: 'Inventory Sync', value: order.inventory_sync_status },
                    { label: 'Payment Method', value: order.payment_method || '—' },
                    order.payment_reference ? { label: 'Payment Ref', value: order.payment_reference } : null,
                    { label: 'Store', value: store?.name || '—' },
                  ].filter(Boolean).map(({ label, value }: any) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-xs font-medium text-slate-200 capitalize">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Warehouse Timeline */}
              <section>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Warehouse Timeline</h3>
                <div className="space-y-4 px-2">
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-600 italic">No movement recorded yet.</p>
                  ) : (
                    history.map((h, i) => (
                      <div key={h.id || `hist-${i}`} className="relative flex gap-4">
                        {/* Connector line */}
                        {i !== history.length - 1 && (
                          <div className="absolute left-[7px] top-4 bottom-[-16px] w-[2px] bg-slate-800" />
                        )}
                        <div className={`mt-1.5 w-4 h-4 rounded-full border-2 border-slate-900 z-10 ${
                          i === 0 ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-slate-700'
                        }`} />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-0.5">
                            <p className={`text-xs font-black uppercase tracking-tight ${i === 0 ? 'text-slate-100' : 'text-slate-400'}`}>
                              {h.label}
                            </p>
                            <p className="text-[10px] font-mono text-slate-500">
                              {new Date(h.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            {h.notes || `Activity recorded: ${h.label}`}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest bg-slate-800/50 px-1.5 py-0.5 rounded">
                               By {h.created_by || 'System'}
                             </span>
                             {h.type === 'status' && h.inventory_action && h.inventory_action !== 'none' && (
                               <span className="text-[9px] font-bold text-cyan-600/80 uppercase tracking-widest">
                                 ⚡ {h.inventory_action} active
                               </span>
                             )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <div className="h-2" />
            </div>
          </div>

          {/* Action footer */}
          <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-md">
            <div className="p-4 space-y-2 pb-safe">
              {/* Confirm payment */}
              {(order.payment_status === 'pending' || order.order_status === 'pending_payment') && (
                <button
                  onClick={async () => {
                    if (isConfirmingPayment) return;
                    setIsConfirmingPayment(true);
                    try {
                      await onConfirmPayment(order.id);
                      onClose();
                    } catch (e) {
                      console.error('Payment confirmation failed:', e);
                    } finally {
                      setIsConfirmingPayment(false);
                    }
                  }}
                  disabled={isConfirmingPayment}
                  className="w-full py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isConfirmingPayment && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isConfirmingPayment ? 'Confirming...' : 'Confirm Payment'}
                </button>
              )}
              {/* Primary actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {order.payment_status === 'paid' && !['picking', 'packing', 'packed', 'ready_to_ship', 'shipped', 'delivered', 'completed'].includes(order.order_status) && (
                  <button
                    onClick={handleStartPicking}
                    disabled={isStartingPicking}
                    className="py-3.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isStartingPicking ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    )}
                    {isStartingPicking ? 'Starting...' : 'Start Picking'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    setIsCreatingShipment(true);
                    await onCreateShipment(order);
                    setIsCreatingShipment(false);
                  }}
                  disabled={isCreatingShipment}
                  className="py-3.5 rounded-xl bg-blue-900/60 hover:bg-blue-800/70 text-blue-200 text-sm font-bold border border-blue-700/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isCreatingShipment ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1.753 11.025A2 2 0 008.745 21h6.51a2 2 0 001.992-1.975L19 8" />
                    </svg>
                  )}
                  {isCreatingShipment ? 'Creating...' : 'Create Shipment'}
                </button>
                {onZebraPrint && (
                  <button
                    onClick={async () => {
                      setIsZebraPrinting(true);
                      await onZebraPrint(order);
                      setIsZebraPrinting(false);
                    }}
                    disabled={isZebraPrinting}
                    className="py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] sm:col-span-2"
                  >
                    {isZebraPrinting ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>🖨️</span>
                    )}
                    {isZebraPrinting ? 'Printing...' : 'Zebra Label'}
                  </button>
                )}
              </div>
              {/* Secondary actions */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onPrintSlip(order)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase transition-all"
                >
                  Slip
                </button>
                <button
                  onClick={() => onPrintInvoice(order)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase transition-all"
                >
                  Invoice
                </button>
                {order.order_status !== 'cancelled' && order.order_status !== 'refunded' ? (
                  <button
                    onClick={async () => {
                      if (isCancelling || isActionLoading) return;
                      setIsCancelling(true);
                      try {
                        await onCancel(order.id);
                        onClose();
                      } finally {
                        setIsCancelling(false);
                      }
                    }}
                    disabled={isCancelling || isActionLoading}
                    className="py-2.5 rounded-xl bg-red-900/30 hover:bg-red-800/40 text-red-400 text-[10px] font-bold uppercase border border-red-700/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isCancelling && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                    Cancel
                  </button>
                ) : (
                   order.payment_status !== 'refunded' && (
                    <button
                      onClick={async () => {
                        if (isReturning || isActionLoading) return;
                        setIsReturning(true);
                        try {
                          await onRefund(order.id);
                          onClose();
                        } finally {
                          setIsReturning(false);
                        }
                      }}
                      disabled={isReturning || isActionLoading}
                      className="py-2.5 rounded-xl bg-amber-900/30 hover:bg-amber-800/40 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-700/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isReturning && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      Return
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStatusSheet && (
        <StatusSheet
          current={currentStatus}
          onSelect={handleStatusSelect}
          onClose={() => setShowStatusSheet(false)}
        />
      )}
    </>,
    document.body
  );
}
