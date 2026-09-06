'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShipmentStatus } from '@/lib/types';
import { ShippingService } from '@/lib/services/shipping/shippingService';
import { ZebraPrintService } from '@/lib/services/shipping/zebraPrintService';
import { formatCurrency } from '@/lib/utils/currency';

interface ShipmentTrackingPanelProps { shipment: any; onClose: () => void; onRefresh?: () => void; }

const PROGRESS_STAGES: ShipmentStatus[] = [ 'label_created', 'collected', 'in_transit', 'arrived_at_depot', 'out_for_delivery', 'delivered' ];

export default function ShipmentTrackingPanel({ shipment, onClose, onRefresh }: ShipmentTrackingPanelProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ShippingService.getShipmentEvents(shipment.id);
      setEvents(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [shipment.id]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleZebraPrint = async () => {
    setIsPrinting(true);
    try {
      const zpl = ZebraPrintService.generateLabelZPL({
        orderNumber: shipment.orders?.order_number || 'N/A',
        customerName: shipment.recipient_name,
        address: `${shipment.recipient_address}, ${shipment.recipient_city} ${shipment.recipient_postcode}`,
        trackingNumber: shipment.tracking_number || 'N/A',
        weight: (shipment.weight_grams / 1000).toFixed(2),
        carrier: shipment.carrier || 'DHL'
      });

      const result = await ZebraPrintService.printZPL(zpl);
      if (result.success) {
        alert('Label sent to Zebra ZD421D!');
        await ShippingService.markLabelPrinted(shipment.id);
      } else {
        alert(`Print Error: ${result.error}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('CANCEL and VOID this shipment? This will attempt to delete the label from DHL and remove it from your records.')) return;
    setIsDeleting(true);
    try {
      const result = await ShippingService.deleteShipment(shipment.id);
      if (result.success) {
        alert('Shipment cancelled and deleted successfully.');
        onRefresh?.();
        onClose();
      } else {
        alert(`Deletion failed: ${result.error}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'out_for_delivery': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'delivery_attempted': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'ready_for_collection': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'delivery_rearranged': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      case 'failed': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'returned': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      default: return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  const currentStageIndex = PROGRESS_STAGES.indexOf(shipment.status);

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-slate-950 border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div><h2 className="text-xl font-bold text-white uppercase tracking-tight">Shipment Details</h2><p className="text-xs text-slate-500 font-mono mt-0.5">{shipment.tracking_number}</p></div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all flex items-center justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Shipment Overview Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
           <div className="p-6 border-b border-slate-800 bg-slate-800/30 grid grid-cols-2 gap-y-4">
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Order</p>
                 <p className="text-sm font-bold text-white">{shipment.orders?.order_number || 'N/A'}</p>
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Customer</p>
                 <p className="text-sm font-bold text-white">{shipment.recipient_name}</p>
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Weight</p>
                 <p className="text-sm font-bold text-cyan-400">{(shipment.weight_grams / 1000).toFixed(2)}kg</p>
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Carrier</p>
                 <p className="text-sm font-bold text-white uppercase">{shipment.carrier} Parcel UK</p>
              </div>
           </div>
           <div className="p-6 grid grid-cols-2 gap-y-4">
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Service</p>
                 <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-md text-[10px] font-black uppercase">Next Day</span>
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cost</p>
                 <p className="text-sm font-bold text-emerald-400">{formatCurrency(shipment.shipping_cost / 100)}</p>
              </div>
              {shipment.label_url && (
                <div className="col-span-2 mt-2">
                   <button
                     onClick={() => window.open(shipment.label_url, '_blank')}
                     className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase tracking-widest rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 mb-2"
                   >
                     📥 Download PDF Label
                   </button>
                   <button
                     onClick={handleZebraPrint}
                     disabled={isPrinting}
                     className="w-full py-3 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2"
                   >
                     {isPrinting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>🖨️</span>}
                     {isPrinting ? 'PRINTING...' : 'PRINT ZEBRA LABEL (ZD421D)'}
                   </button>
                   <button
                     onClick={handleDelete}
                     disabled={isDeleting}
                     className="w-full mt-4 py-3 bg-rose-900/20 hover:bg-rose-900/40 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-rose-500/20 transition-all flex items-center justify-center gap-2"
                   >
                     {isDeleting ? <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <span>🗑️</span>}
                     CANCEL & VOID SHIPMENT
                   </button>
                </div>
              )}
           </div>
        </section>

        <section className="bg-slate-900/50 rounded-3xl p-6 border border-slate-800">
           <div className="flex justify-between items-start mb-8">
              <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Current Status</p><span className={`inline-flex px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusColor(shipment.status)}`}>{shipment.status.replace(/_/g, ' ')}</span></div>
              <div className="text-right"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Delivery</p><p className="text-sm font-bold text-slate-200">{shipment.estimated_delivery ? new Date(shipment.estimated_delivery).toLocaleDateString('en-GB') : 'Pending'}</p></div>
           </div>
           <div className="relative flex justify-between">
              {PROGRESS_STAGES.map((stage, idx) => {
                 const isCompleted = idx <= currentStageIndex;
                 return (
                   <div key={stage} className="flex flex-col items-center relative z-10 w-full">
                      <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${isCompleted ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-800 border-slate-700'}`} />
                      <p className={`text-[8px] mt-2 font-black uppercase tracking-tighter text-center max-w-[60px] ${isCompleted ? 'text-slate-300' : 'text-slate-600'}`}>{stage.replace(/_/g, ' ')}</p>
                   </div>
                 );
              })}
              <div className="absolute top-[5px] left-0 right-0 h-[2px] bg-slate-800 -z-0" />
              <div className="absolute top-[5px] left-0 h-[2px] bg-cyan-500 -z-0 transition-all duration-1000" style={{ width: `${(currentStageIndex / (PROGRESS_STAGES.length - 1)) * 100}%` }} />
           </div>
        </section>

        <section>
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-1">Tracking Timeline</h3>
           <div className="space-y-0 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
              {loading ? <div className="py-8 text-center text-slate-500">Retrieving events...</div> : events.map((event, idx) => (
                <div key={event.id} className="relative pl-10 pb-8 last:pb-0">
                   <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-4 border-slate-950 z-10 ${idx === 0 ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                   <div className="flex flex-col">
                      <div className="flex items-center justify-between"><p className={`text-sm font-bold ${idx === 0 ? 'text-white' : 'text-slate-300'}`}>{event.description}</p><p className="text-[10px] font-mono text-slate-500">{new Date(event.event_time).toLocaleString('en-GB')}</p></div>
                      <div className="flex items-center gap-2 mt-1"><span className="text-[9px] font-black uppercase text-slate-500 tracking-wider bg-slate-800 px-1.5 py-0.5 rounded">{event.status}</span>{event.depot && <span className="text-[10px] text-slate-400">Depot: {event.depot}</span>}</div>
                   </div>
                </div>
              ))}
           </div>
        </section>
      </div>
    </div>
  );
}
