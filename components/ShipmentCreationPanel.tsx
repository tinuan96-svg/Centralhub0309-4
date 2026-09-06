'use client';

import { useState, useEffect, useCallback } from 'react';
import { OrderWithItems, Carrier, ServiceType } from '@/lib/types';
import { ShippingService } from '@/lib/services/shipping/shippingService';
import { formatCurrency } from '@/lib/utils/currency';

interface ShipmentCreationPanelProps { order: OrderWithItems; onClose: () => void; onSuccess: (shipment: any) => void; }

export default function ShipmentCreationPanel({ order, onClose, onSuccess }: ShipmentCreationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [form, setFormData] = useState({ weight_grams: 1000, length_cm: 30, width_cm: 20, height_cm: 15, package_type: 'box', carrier: 'dhl' as Carrier, service_type: 'standard' as ServiceType, ordered_product: '220', special_instructions: '', insurance_amount: 0, signature_required: false, age_verification: false });

  const fetchEstimate = useCallback(async () => {
    setEstimating(true);
    try {
      const res = await ShippingService.getShippingCostEstimate({ fromPostcode: 'E1 6AN', toPostcode: order.delivery_postcode, weightGrams: form.weight_grams, serviceType: form.service_type });
      if (res.success) setEstimate(res);
    } catch (e) { console.error(e); } finally { setEstimating(false); }
  }, [order.delivery_postcode, form.weight_grams, form.service_type]);

  useEffect(() => { fetchEstimate(); }, [fetchEstimate]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await ShippingService.createShipment({ order_id: order.id, recipient_name: order.customer_name, recipient_address: order.delivery_address, recipient_city: order.delivery_city, recipient_postcode: order.delivery_postcode, recipient_phone: order.customer_phone, recipient_email: order.customer_email, ...form });
      if (res.success) onSuccess(res.shipment);
      else alert(res.error || 'Failed to create shipment');
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-10 pt-safe-top">
        <div><h2 className="text-xl font-bold text-white">Create Shipment</h2><p className="text-xs text-slate-500 font-mono mt-0.5">{order.order_number}</p></div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
        <section className="space-y-4">
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Order Summary</h3>
           <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-800 space-y-3">
              <div className="flex justify-between items-center"><span className="text-sm text-slate-300 font-medium">{order.customer_name}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${order.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{order.payment_status}</span></div>
              <p className="text-xs text-slate-400 leading-relaxed">{order.delivery_address}, {order.delivery_city} {order.delivery_postcode}</p>
              <div className="pt-3 border-t border-slate-700/50 flex justify-between items-center"><span className="text-xs text-slate-500">Total Items: <b className="text-slate-300">{(order as any).items?.length || 0}</b></span><span className="text-lg font-black text-white">{formatCurrency(order.total)}</span></div>
           </div>
        </section>
        <section className="space-y-4">
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Parcel Details</h3>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Weight (Grams)</label><input type="number" value={form.weight_grams} onChange={e => setFormData(f => ({ ...f, weight_grams: parseInt(e.target.value) || 0 }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Package Type</label><select value={form.package_type} onChange={e => setFormData(f => ({ ...f, package_type: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none"><option value="box">Cardboard Box</option><option value="envelope">Padded Envelope</option><option value="pallet">Pallet</option></select></div>
           </div>
        </section>
        <section className="space-y-4">
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Courier & Service</h3>
           <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Shipping Service</label><select value={form.ordered_product} onChange={e => setFormData(f => ({ ...f, ordered_product: e.target.value, service_type: e.target.value === '220' ? 'standard' : 'express' }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"><option value="220">DHL Parcel UK (Next Day)</option><option value="226">DHL Parcel Connect (Express)</option><option value="201">DHL Economy (2-3 Days)</option></select></div>
           <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-700 shadow-xl flex items-center justify-between"><div><p className="text-[9px] font-black text-cyan-400 uppercase tracking-tighter">Estimated Contract Rate</p><p className="text-2xl font-black text-white font-mono mt-0.5">{estimating ? '...' : estimate ? formatCurrency(estimate.cost / 100) : '—'}</p></div><div className="text-right"><p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Est. Delivery</p><p className="text-sm font-bold text-slate-300 mt-0.5">Next Working Day</p></div></div>
        </section>
      </div>
      <div className="p-6 border-t border-slate-800 bg-slate-900/90 backdrop-blur-xl absolute bottom-0 inset-x-0"><button onClick={handleCreate} disabled={loading} className="w-full py-5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50">{loading ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <>GENERATE LABEL</>}</button></div>
    </div>
  );
}
