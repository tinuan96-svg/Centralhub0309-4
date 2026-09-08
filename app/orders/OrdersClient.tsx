'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { syncOrders } from '@/lib/services/orderSyncClient';
import { OrderService } from '@/lib/services/orderService';
import { OrderWithItems, OrderStatus, Store, PaymentStatus } from '@/lib/types';
import { StoreService } from '@/lib/services/storeService';
import StoreBadge from '@/components/StoreBadge';
import LiveIndicator from '@/components/LiveIndicator';
import { useRealtimeOrders } from '@/lib/hooks/useRealtimeOrders';
import OrderDetailSheet from '@/components/OrderDetailSheet';
import { useOrderActions } from '@/lib/hooks/useOrderActions';
import StoreScopeSelector from '@/components/StoreScopeSelector';

type TimeRange = 'today' | 'yesterday' | '7days' | '30days' | 'all';

const FULFILLMENT_STATUSES: OrderStatus[] = [
  'pending_payment', 'paid', 'confirmed', 'picking', 'picked', 'packing', 'packed',
  'ready_to_ship', 'shipment_booked', 'collected', 'shipped', 'at_local_depot',
  'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded',
  'delivery_attempted', 'ready_for_collection', 'delivery_rescheduled', 'returned', 'failed'
];

const FULFILLMENT_STYLES: Record<string, string> = {
  pending_payment:    'bg-slate-800 text-slate-400 border-slate-700',
  paid:               'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  confirmed:          'bg-blue-900/40 text-blue-300 border-blue-700/40',
  picking:            'bg-cyan-900/40 text-cyan-300 border-cyan-700/40',
  picked:             'bg-teal-900/40 text-teal-300 border-teal-700/40',
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
  failed:             'bg-red-900/40 text-red-300 border-red-700/40',
};

const PAYMENT_STYLES: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  refunded: 'bg-slate-800 text-slate-400 border-slate-700',
};

function fmt(p: number) { return `£${Number(p).toFixed(2)}`; }
function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

function DesktopTableRow({ order, store, isSelected, onToggleSelect, onOpenDetail, onStatusChange }: { order: OrderWithItems; store?: Store; isSelected: boolean; onToggleSelect: () => void; onOpenDetail: () => void; onStatusChange: (id: string, status: OrderStatus) => Promise<void> }) {
  const { date, time } = fmtDate(order.created_at);
  const items = order.items || [];

  // Calculate profit and margin excluding delivery fee
  const productRevenue = (Number(order.total) || 0) - (Number(order.delivery_fee) || 0);
  const totalCost = items.reduce((sum, item) => sum + (Number(item?.cost_price) || 0) * (item?.quantity || 0), 0);
  const profit = productRevenue - totalCost;
  const margin = productRevenue > 0 ? (profit / productRevenue) * 100 : 0;

  return (
    <tr onClick={onOpenDetail} className={`border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors cursor-pointer ${isSelected ? 'bg-blue-900/10' : ''}`}>
      <td className="px-3 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500" /></td>
      <td className="px-3 py-3">
        {store ? (
          <StoreBadge store={store} size="sm" />
        ) : (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
            <span className="text-[10px] text-slate-500 font-medium">No Store</span>
          </div>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap"><p className="text-xs text-slate-200">{date}</p><p className="text-[10px] text-slate-500 font-mono">{time}</p></td>
      <td className="px-3 py-3 font-mono text-sm font-bold text-slate-100">{order.order_number}</td>
      <td className="px-3 py-3 font-medium text-slate-200">{order.customer_name || 'Unknown Customer'}</td>
      <td className="px-3 py-3 text-right font-black text-slate-100">{fmt(order.total || 0)}</td>
      <td className="px-3 py-3 text-right"><span className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(profit)}</span><p className="text-[10px] text-slate-500">({margin.toFixed(0)}%)</p></td>
      <td className="px-3 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${PAYMENT_STYLES[order.payment_status] || 'border-slate-700 text-slate-500'}`}>{order.payment_status}</span></td>
      <td className="px-3 py-3" onClick={e => e.stopPropagation()}><select value={order.order_status} onChange={e => onStatusChange(order.id, e.target.value as OrderStatus)} className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border focus:outline-none ${FULFILLMENT_STYLES[order.order_status] || 'border-slate-700 text-slate-500'}`}>{FULFILLMENT_STATUSES.map(s => <option key={s} value={s} className="bg-slate-900">{s.replace(/_/g, ' ')}</option>)}</select></td>
    </tr>
  );
}

export default function OrdersPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { stores: allStores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<OrderStatus | 'operational' | 'all'>('all');
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | 'all'>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OrderWithItems | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      let startDate, endDate;
      const now = new Date();
      if (timeRange === 'today') {
        startDate = new Date(now.setHours(0,0,0,0)).toISOString();
      } else if (timeRange === 'yesterday') {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        startDate = new Date(yest.setHours(0,0,0,0)).toISOString();
        endDate = new Date(yest.setHours(23,59,59,999)).toISOString();
      } else if (timeRange === '7days') {
        const week = new Date();
        week.setDate(week.getDate() - 7);
        startDate = week.toISOString();
      } else if (timeRange === '30days') {
        const month = new Date();
        month.setDate(month.getDate() - 30);
        startDate = month.toISOString();
      }

      const { orders: o, totalCount: count } = await OrderService.getAllOrders({
        storeId: selectedStoreId,
        page: currentPage,
        pageSize,
        status: filterTab,
        paymentStatus: filterPayment,
        search: searchQuery,
        startDate,
        endDate
      });
      const s = await StoreService.getAllStores();
      setOrders(o);
      setTotalCount(count);
      setStores(s);
      setLastUpdated(new Date());
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }, [currentPage, filterTab, filterPayment, searchQuery, timeRange, selectedStoreId]);

  const {
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
  } = useOrderActions(() => loadOrders());

  const syncFromSources = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const data = await syncOrders();
      if (data.failures && data.failures.length > 0) {
        const failedStores = data.failures.map((f) => f.store).join(', ');
        setSyncError(`Sync partially failed for: ${failedStores}`);
      } else if (!data.success) {
        setSyncError(data.error || data.message || 'Sync failed');
      }
    } catch (e: any) {
      setSyncError(e?.message || 'Sync failed');
      console.error('Auto-sync error:', e);
    } finally { setIsSyncing(false); }
  }, []);

  // Update detailOrder if it's currently open to reflect new data
  useEffect(() => {
    if (detailOrder) {
      const updated = orders.find(o => o.id === detailOrder.id);
      if (updated && updated.updated_at !== detailOrder.updated_at) {
        setDetailOrder(updated);
      }
    }
  }, [orders, detailOrder]);

  // Initial load + auto-sync from remote stores on mount
  useEffect(() => {
    (async () => {
      await loadOrders();
      await syncFromSources();
      await loadOrders();
    })();
  }, [loadOrders, syncFromSources]);

  // Periodic background sync every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      await syncFromSources();
      await loadOrders();
    }, 60000);
    return () => clearInterval(interval);
  }, [syncFromSources, loadOrders]);

  useRealtimeOrders({ onOrderCreated: () => loadOrders(), onOrderUpdated: () => loadOrders(), enabled: true });

  if (!mounted) return <div className="min-h-screen bg-slate-950 flex items-center justify-center animate-pulse"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (isLoading && orders.length === 0) return <div className="p-4 sm:p-8 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse text-sm sm:text-base">Loading Operational Queue...</div>;

  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
      <div className="sticky top-14 md:static z-20 bg-slate-950/80 backdrop-blur-md md:bg-transparent -mx-3 px-3 py-3 border-b md:border-0 border-slate-800/50 flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6">
         <div className="space-y-3 sm:space-y-4 min-w-0">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tighter">Order Queue</h1>
              <LiveIndicator isLive={true} lastUpdated={lastUpdated} />
              <button
                onClick={async () => { await syncFromSources(); await loadOrders(); }}
                disabled={isSyncing}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
              >
                {isSyncing ? 'Syncing...' : 'Sync All'}
              </button>
            </div>
            {syncError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs">
                <span>Sync Error</span>
                <button onClick={() => { setSyncError(null); syncFromSources().then(() => loadOrders()); }} className="text-red-400 hover:text-red-200 underline ml-auto font-bold uppercase text-[10px]">Retry</button>
              </div>
            )}
            <div className="flex gap-1 overflow-x-auto no-scrollbar bg-slate-900/50 p-1 rounded-2xl border border-slate-800/50">
               {[
                 {id:'operational', label:'📋 Ops'},
                 {id:'pending_payment', label:'⏳ Pending'},
                 {id:'paid', label:'💰 Paid'},
                 {id:'confirmed', label:'✅ Confirmed'},
                 {id:'picking', label:'⛏️ Picking'},
                 {id:'picked', label:'📦 Picked'},
                 {id:'packing', label:'🎁 Packing'},
                 {id:'packed', label:'📦 Packed'},
                 {id:'ready_to_ship', label:'🚚 Ready'},
                 {id:'shipped', label:'🚛 Shipped'},
                 {id:'all', label:'📂 All'}
               ].map(t => (
                 <button key={t.id} onClick={() => { setFilterTab(t.id as any); setCurrentPage(1); }} className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterTab === t.id ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}>{t.label}</button>
               ))}
            </div>
         </div>
         <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setShowArchived(!showArchived)} className={`flex-1 md:flex-none px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showArchived ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{showArchived ? 'Hide Archived' : 'Show Archived'}</button>
            
         </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-4 space-y-3 sm:space-y-4">
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/50 pb-4 mb-4">
            <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
         </div>
         <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            <div className="relative flex-1 w-full"><input type="text" placeholder="Search Order No, Customer..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">🔍</span></div>
         </div>
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
         <div className="overflow-x-auto"><table className="w-full text-sm">
               <thead className="bg-slate-800/50 border-b border-slate-700/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <tr><th className="px-3 py-4 text-left w-10"><input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500" /></th><th className="px-3 py-4 text-left">Store</th><th className="px-3 py-4 text-left">Date</th><th className="px-3 py-4 text-left">Order No</th><th className="px-3 py-4 text-left">Customer</th><th className="px-3 py-4 text-right">Total</th><th className="px-3 py-4 text-right">Profit</th><th className="px-3 py-4 text-center">Payment</th><th className="px-3 py-4 text-left">Fulfillment</th></tr>
               </thead>
               <tbody className="divide-y divide-slate-800/50">{orders.map(o => (<DesktopTableRow key={o.id} order={o} store={stores.find(s => s.id === o.store_id)} isSelected={false} onToggleSelect={() => {}} onOpenDetail={() => setDetailOrder(o)} onStatusChange={handleStatusChange} />))}</tbody>
         </table></div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {orders.length === 0 && !isLoading && (
          <div className="text-center py-12 text-slate-500 text-sm">No orders found</div>
        )}
        {orders.map(o => {
          const store = stores.find(s => s.id === o.store_id);
          const { date, time } = fmtDate(o.created_at);
          const items = o.items || [];

          // Calculate profit and margin excluding delivery fee
          const productRevenue = (Number(o.total) || 0) - (Number(o.delivery_fee) || 0);
          const totalCost = items.reduce((sum, item) => sum + (Number(item?.cost_price) || 0) * (item?.quantity || 0), 0);
          const profit = productRevenue - totalCost;

          return (
            <div key={o.id} onClick={() => setDetailOrder(o)} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3 active:bg-slate-800/40 transition-colors cursor-pointer shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-mono font-black text-slate-100 uppercase tracking-tighter truncate">#{o.order_number}</span>
                {store && <StoreBadge store={store} size="sm" />}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300 truncate flex-1 uppercase tracking-tight">{o.customer_name || 'Unknown'}</span>
                <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{date} · {time}</span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-black">Revenue</span>
                    <span className="text-lg font-black text-slate-100">{fmt(o.total || 0)}</span>
                </div>
                <div className="text-right flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-black">Profit</span>
                    <span className={`text-base font-black ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(profit)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/50">
                <span className={`inline-flex px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${PAYMENT_STYLES[o.payment_status] || 'border-slate-700 text-slate-500'}`}>{o.payment_status}</span>
                <span className={`inline-flex px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${FULFILLMENT_STYLES[o.order_status] || 'border-slate-700 text-slate-500'}`}>{o.order_status.replace(/_/g, ' ')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            disabled={currentPage === 1 || isLoading}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-slate-500 text-xs font-bold">
            Page {currentPage} of {Math.ceil(totalCount / pageSize)}
          </span>
          <button
            disabled={currentPage >= Math.ceil(totalCount / pageSize) || isLoading}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Sticky Mobile Action Bar */}
      <div className="md:hidden fixed bottom-[64px] left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 z-30 flex gap-3 pb-safe-bottom">
        <div className="flex-1 flex gap-1 bg-slate-950 border border-slate-800 rounded-2xl p-1 overflow-x-auto no-scrollbar">
           {['all', 'today', '7days'].map(r => (
             <button
                key={r}
                onClick={() => { setTimeRange(r as any); setCurrentPage(1); }}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeRange === r ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500'}`}
             >
                {r}
             </button>
           ))}
        </div>
        
      </div>

      {detailOrder && <OrderDetailSheet order={detailOrder} store={stores.find(s => s.id === detailOrder.store_id)} onClose={() => setDetailOrder(null)} onStatusChange={handleStatusChange} onConfirmPayment={handleConfirmPayment} onCancel={handleCancelOrder} onRefund={handleRefundOrder} onDelete={handleDeleteOrder} onPrintSlip={handlePrintPackingSlip} onPrintInvoice={handlePrintInvoice} onCreateShipment={handleCreateShipment} onZebraPrint={handleZebraPrint} onRefreshFromSource={o => handleRefreshFromSource(o.id)} isActionLoading={isActionLoading} />}
    </div>
  );
}
