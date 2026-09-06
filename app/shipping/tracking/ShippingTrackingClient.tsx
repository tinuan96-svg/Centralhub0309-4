'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ShippingService } from '@/lib/services/shipping/shippingService';
import { StoreService } from '@/lib/services/storeService';
import StoreBadge from '@/components/StoreBadge';
import ShipmentTrackingPanel from '@/components/ShipmentTrackingPanel';
import LiveIndicator from '@/components/LiveIndicator';

const STATUS_GROUPS: Record<string, string[]> = {
  awaiting_shipment: ['not_shipped', 'ready_to_ship', 'label_created'],
  collected: ['collected', 'awaiting_collection'],
  in_transit: ['in_transit', 'arrived_at_depot'],
  out_for_delivery: ['out_for_delivery'],
  delivered: ['delivered'],
  failed: ['failed', 'customer_not_home', 'delivery_attempted'],
  returned: ['returned', 'returned_to_depot', 'returning_to_sender']
};

export default function ShipmentTrackingPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [shipments, setShipments] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStore, setFilterStore] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedShipment, setSelectedShipment] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [shipmentData, storesData] = await Promise.all([
        ShippingService.getShipments(),
        StoreService.getAllStores()
      ]);
      setShipments(shipmentData);
      setStores(storesData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredShipments = useMemo(() => {
    return shipments.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.tracking_number?.toLowerCase().includes(q) || s.orders?.order_number?.toLowerCase().includes(q) || s.recipient_name?.toLowerCase().includes(q);
      const matchStore = filterStore === 'all' || s.orders?.store_id === filterStore;
      const matchTab = activeTab === 'all' || STATUS_GROUPS[activeTab]?.includes(s.status);
      return matchSearch && matchStore && matchTab;
    });
  }, [shipments, search, filterStore, activeTab]);

  const getBadgeColor = (status: string) => {
    if (STATUS_GROUPS.delivered.includes(status)) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (STATUS_GROUPS.out_for_delivery.includes(status)) return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    if (status === 'delivery_attempted') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (status === 'ready_for_collection') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (STATUS_GROUPS.failed.includes(status)) return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  if (loading && shipments.length === 0) return <div className="p-8 text-center text-slate-400 animate-pulse font-black uppercase tracking-widest">Initializing Tracking...</div>;

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-100 uppercase tracking-tight">Shipment Tracking</h1><p className="text-sm text-slate-500">Real-time status monitoring for all carrier dispatches</p></div>
        <LiveIndicator isLive={true} lastUpdated={new Date()} />
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
         <div className="p-4 border-b border-slate-800 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[300px]"><input type="text" placeholder="Search by Tracking #, Order #, Customer..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 pl-10" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span></div>
            <select value={filterStore} onChange={e => setFilterStore(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold uppercase text-slate-300 focus:outline-none">{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
         </div>

         <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
               <tr><th className="px-6 py-4 text-left">Store & Order</th><th className="px-6 py-4 text-left">Customer</th><th className="px-6 py-4 text-left">Courier & Service</th><th className="px-6 py-4 text-left">Tracking Number</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
               {filteredShipments.map(s => (
                 <tr key={s.id} className="hover:bg-slate-800/30 transition-all cursor-pointer" onClick={() => setSelectedShipment(s)}>
                    <td className="px-6 py-4"><div className="flex flex-col gap-1.5"><StoreBadge store={stores.find(st => st.id === s.orders?.store_id)} size="sm" /><span className="font-mono text-xs font-bold text-slate-200">{s.orders?.order_number}</span></div></td>
                    <td className="px-6 py-4"><p className="font-bold text-white">{s.recipient_name}</p><p className="text-[10px] text-slate-500 uppercase font-bold">{s.recipient_city}</p></td>
                    <td className="px-6 py-4"><p className="text-xs font-black text-slate-300 uppercase">{s.carrier} eCommerce</p><p className="text-[10px] text-slate-500 font-bold uppercase">{s.service_type}</p></td>
                    <td className="px-6 py-4"><p className="font-mono text-xs text-cyan-400 font-bold">{s.tracking_number}</p></td>
                    <td className="px-6 py-4 text-center"><span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getBadgeColor(s.status)}`}>{s.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-6 py-4 text-right"><button className="p-2 bg-slate-800 text-slate-400 hover:text-cyan-400 rounded-xl transition-all border border-slate-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button></td>
                 </tr>
               ))}
            </tbody>
         </table></div>
      </div>
      {selectedShipment && <ShipmentTrackingPanel shipment={selectedShipment} onClose={() => setSelectedShipment(null)} onRefresh={loadData} />}
    </div>
  );
}
