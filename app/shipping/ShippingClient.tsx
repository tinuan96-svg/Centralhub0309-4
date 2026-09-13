'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShippingService } from '@/lib/services/shipping/shippingService';
import { DHLService, DHLStatusResponse } from '@/lib/services/shipping/dhlService';
import { FulfillmentService, FulfillmentOrder } from '@/lib/services/fulfillmentService';
import SkeletonLoader from '@/components/SkeletonLoader';
import { ZebraPrintService } from '@/lib/services/shipping/zebraPrintService';

function openLabel(labelUrl: string) {
  if (labelUrl.startsWith('data:')) {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      if (labelUrl.startsWith('data:application/pdf')) {
        newWindow.document.write(
          `<html><head><title>DHL Shipping Label</title></head><body style="margin:0">` +
          `<embed width="100%" height="100%" src="${labelUrl}" type="application/pdf" />` +
          `</body></html>`
        );
      } else {
        newWindow.document.write(
          `<html><head><title>DHL Shipping Label</title></head><body style="margin:0;display:flex;justify-content:center;background:#1e293b">` +
          `<img src="${labelUrl}" style="max-width:100%;height:auto" />` +
          `</body></html>`
        );
      }
      newWindow.document.close();
    }
  } else {
    window.open(labelUrl, '_blank');
  }
}

function getDeliveryStatusBadge(status: string | undefined): { label: string; classes: string } {
  if (!status) return { label: '-', classes: 'bg-slate-700/30 text-slate-500 border-slate-700/30' };
  const map: Record<string, { label: string; classes: string }> = {
    label_created: { label: 'Label Created', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    ready_to_ship: { label: 'Ready to Ship', classes: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
    collected: { label: 'Collected', classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
    in_transit: { label: 'In Transit', classes: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
    at_local_depot: { label: 'At Depot', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    arrived_at_depot: { label: 'At Depot', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    out_for_delivery: { label: 'Out for Delivery', classes: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
    delivered: { label: 'Delivered', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    failed: { label: 'Failed', classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
    returned: { label: 'Returned', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
    cancelled: { label: 'Cancelled', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
    delivery_attempted: { label: 'Attempted', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    ready_for_collection: { label: 'Ready for Collection', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    delivery_rescheduled: { label: 'Rescheduled', classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  };
  return map[status] || { label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), classes: 'bg-slate-500/10 text-slate-400 border-slate-500/30' };
}

interface ManualShipmentForm {
  // Recipient
  recipientName: string;
  recipientCompany: string;
  recipientAddress1: string;
  recipientAddress2: string;
  recipientCity: string;
  recipientPostcode: string;
  recipientPhone: string;
  recipientEmail: string;
  // Parcel
  weightKg: string;
  numberOfItems: string;
  reference: string;
  specialInstructions: string;
  labelFormat: 'PDF' | 'PNG' | 'ZPL';
}

const emptyForm: ManualShipmentForm = {
  recipientName: '',
  recipientCompany: '',
  recipientAddress1: '',
  recipientAddress2: '',
  recipientCity: '',
  recipientPostcode: '',
  recipientPhone: '',
  recipientEmail: '',
  weightKg: '1',
  numberOfItems: '1',
  reference: '',
  specialInstructions: '',
  labelFormat: 'PDF',
};

function ManualShipmentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (result: { trackingNumber?: string; shipmentNumber?: string; labelUrl?: string }, formData: ManualShipmentForm) => void }) {
  const [form, setForm] = useState<ManualShipmentForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof ManualShipmentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError('');

    if (!form.recipientName.trim()) { setError('Recipient name is required'); return; }
    if (!form.recipientAddress1.trim()) { setError('Address line 1 is required'); return; }
    if (!form.recipientCity.trim()) { setError('City is required'); return; }
    if (!form.recipientPostcode.trim()) { setError('Postcode is required'); return; }

    const weightKg = parseFloat(form.weightKg);
    if (isNaN(weightKg) || weightKg < 0.1) { setError('Minimum parcel weight is 0.1 kg'); return; }
    if (weightKg > 30) { setError('Maximum parcel weight is 30 kg (DHL limit)'); return; }

    setSubmitting(true);
    try {
      const result = await ShippingService.createManualShipment({
        recipient_name: form.recipientName.trim(),
        recipient_company_name: form.recipientCompany.trim(),
        recipient_address: form.recipientAddress1.trim() + (form.recipientAddress2.trim() ? `, ${form.recipientAddress2.trim()}` : ''),
        recipient_city: form.recipientCity.trim(),
        recipient_postcode: form.recipientPostcode.trim(),
        recipient_phone: form.recipientPhone.trim(),
        recipient_email: form.recipientEmail.trim(),
        weight_grams: Math.round(weightKg * 1000),
        service_type: 'standard',
        reference: form.reference.trim(),
        special_instructions: form.specialInstructions.trim(),
      });

      if (!result.success) {
        setError(result.error || 'DHL shipment creation failed');
        return;
      }

      onSuccess({
        trackingNumber: result.shipment?.tracking_number ?? undefined,
        shipmentNumber: result.shipment?.shipment_number ?? undefined,
        labelUrl: result.shipment?.label_url ?? undefined,
      }, form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create shipment');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Create Manual Shipment</h2>
            <p className="text-sm text-slate-400 mt-0.5">DHL eCommerce UK — Next Day Domestic</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Form */}
        <form id="manual-shipment-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-6">

            {/* Recipient */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
                Recipient Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full Name <span className="text-red-400">*</span></label>
                  <input value={form.recipientName} onChange={set('recipientName')} className={inputClass} placeholder="John Smith" required />
                </div>
                <div>
                  <label className={labelClass}>Company (optional)</label>
                  <input value={form.recipientCompany} onChange={set('recipientCompany')} className={inputClass} placeholder="Acme Ltd" />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Address Line 1 <span className="text-red-400">*</span></label>
                  <input value={form.recipientAddress1} onChange={set('recipientAddress1')} className={inputClass} placeholder="10 Downing Street" required />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Address Line 2 (optional)</label>
                  <input value={form.recipientAddress2} onChange={set('recipientAddress2')} className={inputClass} placeholder="Flat 2" />
                </div>
                <div>
                  <label className={labelClass}>City <span className="text-red-400">*</span></label>
                  <input value={form.recipientCity} onChange={set('recipientCity')} className={inputClass} placeholder="London" required />
                </div>
                <div>
                  <label className={labelClass}>Postcode <span className="text-red-400">*</span></label>
                  <input value={form.recipientPostcode} onChange={set('recipientPostcode')} className={inputClass} placeholder="SW1A 2AA" required />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input value={form.recipientPhone} onChange={set('recipientPhone')} className={inputClass} placeholder="07700900000" />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={form.recipientEmail} onChange={set('recipientEmail')} className={inputClass} placeholder="john@example.com" />
                </div>
              </div>
            </div>

            {/* Parcel */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">2</span>
                Parcel Details
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Weight (kg) <span className="text-red-400">*</span></label>
                  <input type="number" step="0.1" min="0.1" max="30" value={form.weightKg} onChange={set('weightKg')} className={inputClass} placeholder="1.0" required />
                </div>
                <div>
                  <label className={labelClass}>Items</label>
                  <input type="number" min="1" max="99" value={form.numberOfItems} onChange={set('numberOfItems')} className={inputClass} placeholder="1" />
                </div>
                <div>
                  <label className={labelClass}>Label Format</label>
                  <select value={form.labelFormat} onChange={set('labelFormat')} className={inputClass}>
                    <option value="PDF">PDF</option>
                    <option value="PNG">PNG</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Reference / Order No.</label>
                  <input value={form.reference} onChange={set('reference')} className={inputClass} placeholder="e.g. INV-001" />
                </div>
                <div className="col-span-3">
                  <label className={labelClass}>Special Instructions</label>
                  <textarea value={form.specialInstructions} onChange={set('specialInstructions')} rows={2} className={`${inputClass} resize-none`} placeholder="Leave at door, handle with care..." />
                </div>
              </div>
            </div>

            {/* Service info */}
            <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4 flex items-start gap-3">
              <div className="text-blue-400 mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="text-xs text-blue-300">
                This will create a live DHL Next Day domestic shipment via the DHL eCommerce UK Cloud API. A real tracking number and label will be generated.
              </div>
            </div>

            {error && (
              <div className="bg-rose-900/40 border border-rose-800/50 rounded-xl px-4 py-3 text-sm text-rose-300 flex items-start gap-3">
                <svg className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="flex-1">{error}</div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800/60 flex gap-3 justify-end">
          <button onClick={onClose} type="button" className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all">
            Cancel
          </button>
          <button
            type="submit"
            form="manual-shipment-form"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                Booking...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Book Shipment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExternalShipmentForm {
  trackingNumber: string;
  carrier: string;
  weightKg: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientPostcode: string;
  notes: string;
}

const emptyExternalForm: ExternalShipmentForm = {
  trackingNumber: '',
  carrier: 'dhl',
  weightKg: '1',
  recipientName: '',
  recipientAddress: '',
  recipientCity: '',
  recipientPostcode: '',
  notes: '',
};

function ExternalShipmentModal({ order, onClose, onSuccess }: { order: FulfillmentOrder | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<ExternalShipmentForm>(emptyExternalForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) {
      setForm({
        ...emptyExternalForm,
        recipientName: order.customer_name || '',
        recipientAddress: order.delivery_address || '',
        recipientCity: order.delivery_city || '',
        recipientPostcode: order.delivery_postcode || '',
      });
    }
  }, [order]);

  const set = (key: keyof ExternalShipmentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.trackingNumber.trim()) { setError('Tracking number is required'); return; }

    setSubmitting(true);
    try {
      const result = await ShippingService.recordExternalShipment({
        order_id: order?.id,
        order_number: order?.order_number,
        tracking_number: form.trackingNumber.trim(),
        carrier: form.carrier || 'dhl',
        weight_grams: Math.round(parseFloat(form.weightKg || '1') * 1000),
        recipient_name: form.recipientName.trim() || 'N/A',
        recipient_address: form.recipientAddress.trim() || 'N/A',
        recipient_city: form.recipientCity.trim() || 'N/A',
        recipient_postcode: form.recipientPostcode.trim() || 'N/A',
        notes: form.notes.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error || 'Failed to record shipment');
        return;
      }
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record shipment');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Record External Shipment</h2>
            <p className="text-sm text-slate-400 mt-0.5">For shipments booked outside CentralHub (e.g. DHL website)</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form id="external-shipment-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {order && (
              <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-3 text-sm text-blue-300">
                Linking to order <span className="font-mono font-bold">{order.order_number}</span> — {order.customer_name}
              </div>
            )}
            <div>
              <label className={labelClass}>Tracking Number <span className="text-red-400">*</span></label>
              <input value={form.trackingNumber} onChange={set('trackingNumber')} className={inputClass} placeholder="e.g. JD000123456789" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Carrier</label>
                <select value={form.carrier} onChange={set('carrier')} className={inputClass}>
                  <option value="dhl">DHL</option>
                  <option value="royal_mail">Royal Mail</option>
                  <option value="dpd">DPD</option>
                  <option value="hermes">Hermes</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Weight (kg)</label>
                <input type="number" step="0.1" min="0.1" max="30" value={form.weightKg} onChange={set('weightKg')} className={inputClass} placeholder="1.0" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Recipient Name</label>
              <input value={form.recipientName} onChange={set('recipientName')} className={inputClass} placeholder="John Smith" />
            </div>
            <div>
              <label className={labelClass}>Recipient Address</label>
              <input value={form.recipientAddress} onChange={set('recipientAddress')} className={inputClass} placeholder="10 Downing Street" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input value={form.recipientCity} onChange={set('recipientCity')} className={inputClass} placeholder="London" />
              </div>
              <div>
                <label className={labelClass}>Postcode</label>
                <input value={form.recipientPostcode} onChange={set('recipientPostcode')} className={inputClass} placeholder="SW1A 2AA" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputClass} resize-none`} placeholder="Booked via DHL website on..." />
            </div>
            <div className="bg-amber-950/30 border border-amber-800/30 rounded-xl p-4 flex items-start gap-3">
              <div className="text-amber-400 mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="text-xs text-amber-300">
                This records a shipment that was booked outside CentralHub. No label will be generated. The order will be marked as shipped.
              </div>
            </div>
            {error && (
              <div className="bg-rose-900/40 border border-rose-800/50 rounded-xl px-4 py-3 text-sm text-rose-300">{error}</div>
            )}
          </div>
        </form>

        <div className="p-6 border-t border-slate-800/60 flex gap-3 justify-end">
          <button onClick={onClose} type="button" className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all">Cancel</button>
          <button type="submit" form="external-shipment-form" disabled={submitting}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-all disabled:opacity-60 flex items-center gap-2">
            {submitting ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Saving...</>
            ) : (
              <>Record Shipment</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShipmentSuccessModal({ result, onClose, orderData }: {
  result: { trackingNumber?: string; shipmentNumber?: string; labelUrl?: string };
  onClose: () => void;
  orderData?: { orderNumber: string; customerName: string; address: string; weight: string; carrier: string };
}) {
  const [printingZebra, setPrintingZebra] = useState(false);

  const handleZebraPrint = async () => {
    if (!orderData || !result.trackingNumber) return;
    setPrintingZebra(true);
    const zpl = ZebraPrintService.generateLabelZPL({
      orderNumber: orderData.orderNumber,
      customerName: orderData.customerName,
      address: orderData.address,
      trackingNumber: result.trackingNumber,
      weight: orderData.weight,
      carrier: orderData.carrier
    });
    const res = await ZebraPrintService.printZPL(zpl);
    if (!res.success) alert(res.error);
    setPrintingZebra(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-2">Shipment Booked</h2>
        <p className="text-sm text-slate-400 mb-6">DHL Next Day shipment created successfully.</p>

        {result.trackingNumber && (
          <div className="bg-slate-800/60 rounded-xl p-4 mb-4 text-left">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Tracking Number</div>
            <div className="font-mono text-emerald-400 text-lg font-semibold">{result.trackingNumber}</div>
          </div>
        )}
        {result.shipmentNumber && result.shipmentNumber !== result.trackingNumber && (
          <div className="bg-slate-800/60 rounded-xl p-4 mb-4 text-left">
            <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Shipment Number</div>
            <div className="font-mono text-blue-400 font-medium">{result.shipmentNumber}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          {result.labelUrl && (
            <button
              onClick={() => openLabel(result.labelUrl!)}
              className="py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700"
            >
              PDF Label
            </button>
          )}
          <button
            onClick={handleZebraPrint}
            disabled={printingZebra || !orderData}
            className="py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
          >
            {printingZebra ? 'Printing...' : 'Zebra Print'}
          </button>
          <button onClick={onClose} className="col-span-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShippingPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('all');
  const [processing, setProcessing] = useState(false);
  const [dhlStatus, setDhlStatus] = useState<DHLStatusResponse | null>(null);
  const [checkingDhl, setCheckingDhl] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [externalOrder, setExternalOrder] = useState<FulfillmentOrder | null>(null);
  const [manualResult, setManualResult] = useState<{ trackingNumber?: string; shipmentNumber?: string; labelUrl?: string } | null>(null);
  const [successOrderData, setSuccessOrderData] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  const [fullStats, setFullStats] = useState<any>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [data, stats] = await Promise.all([
        FulfillmentService.getOrdersReadyForShipping(),
        FulfillmentService.getFulfillmentStats()
      ]);
      setOrders(data);
      setFullStats(stats);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefreshTracking = useCallback(async (shipmentId: string) => {
    setRefreshing(prev => new Set(prev).add(shipmentId));
    try {
      const result = await ShippingService.trackShipment(shipmentId);
      if (result.success) {
        await loadOrders();
      } else {
        console.error('Tracking refresh failed:', result.error);
      }
    } catch (err) {
      console.error('Tracking refresh error:', err);
    } finally {
      setRefreshing(prev => { const s = new Set(prev); s.delete(shipmentId); return s; });
    }
  }, [loadOrders]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const checkDhlStatus = useCallback(async () => {
    setCheckingDhl(true);
    try {
      const status = await DHLService.getApiStatus();
      setDhlStatus(status);

      // If connected, you can optionally run a diagnostic check in the console
      if (status.success) {
        console.log('DHL API status check passed.');
      }
    } catch {
      setDhlStatus({ success: false, configured: false, error: 'Connection check failed' });
    } finally {
      setCheckingDhl(false);
    }
  }, []);

  const runDiagnostic = async () => {
    setCheckingDhl(true);
    try {
      const data = await DHLService.diagnose();
      console.log('DHL Diagnostic Result:', data);
      alert(`DHL Diagnostic:\nAuth: ${data.tokenStatus}\nEnv: ${data.config.environment}\nCheck console for full details.`);
    } catch (err: any) {
      alert(`Diagnostic failed: ${err.message}`);
    } finally {
      setCheckingDhl(false);
    }
  };

  useEffect(() => { checkDhlStatus(); }, [checkDhlStatus]);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'failed') return orders.filter(o => o.shipment?.status === 'failed');
    if (filter === 'in_transit') return orders.filter(o => o.shipment?.status === 'in_transit' || o.shipment?.status === 'collected');
    if (filter === 'at_local_depot') return orders.filter(o => o.shipment?.status === 'at_local_depot' || o.shipment?.status === 'arrived_at_depot');
    if (filter === 'out_for_delivery') return orders.filter(o => o.shipment?.status === 'out_for_delivery');
    if (filter === 'delivered') return orders.filter(o => o.shipment?.status === 'delivered');
    return orders.filter(order => order.fulfillment_status === filter);
  }, [orders, filter]);

  const toggleSelection = useCallback((orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
  }, [filteredOrders]);

  const deselectAll = useCallback(() => setSelectedOrders(new Set()), []);

  const handleBulkCreateShipments = useCallback(async () => {
    if (selectedOrders.size === 0) return;

    setProcessing(true);
    try {
      const orderIds = Array.from(selectedOrders);
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const orderId of orderIds) {
        const order = orders.find(o => o.id === orderId);
        if (!order || order.shipment) continue;
        const weightGrams = Math.max(100, Math.round(order.total_weight_kg * 1000));
        const result = await ShippingService.createShipment({
          order_id: orderId, carrier: 'dhl', service_type: 'standard', weight_grams: weightGrams,
          recipient_name: order.customer_name, recipient_company_name: order.company_name || undefined,
          recipient_address: order.delivery_address, recipient_city: order.delivery_city,
          recipient_postcode: order.delivery_postcode, recipient_phone: order.customer_phone || '',
          recipient_email: order.customer_email,
        });
        if (result.success) successCount++;
        else { failCount++; errors.push(`${order.order_number}: ${result.error}`); }
      }

      let message = `Created ${successCount} shipment${successCount !== 1 ? 's' : ''} successfully.`;
      if (failCount > 0) message += `\n\n${failCount} failed:\n${errors.join('\n')}`;
      alert(message);
      await loadOrders();
      deselectAll();
    } catch (error) {
      console.error('Error creating bulk shipments:', error);
      alert('Failed to create shipments');
    } finally {
      setProcessing(false);
    }
  }, [selectedOrders, orders, loadOrders, deselectAll]);

  const handleBulkDownloadLabels = useCallback(async () => {
    const orderIds = Array.from(selectedOrders);
    const ordersWithShipments = orders.filter(o => orderIds.includes(o.id) && o.shipment?.label_url);
    if (ordersWithShipments.length === 0) { alert('No labels available for selected orders'); return; }
    ordersWithShipments.forEach((order, index) => {
      setTimeout(() => { if (order.shipment?.label_url) openLabel(order.shipment.label_url); }, index * 500);
    });
  }, [selectedOrders, orders]);

  const handleBulkMarkShipped = useCallback(async () => {
    if (selectedOrders.size === 0) return;
    const confirmed = confirm(`Mark ${selectedOrders.size} orders as shipped?`);
    if (!confirmed) return;
    setProcessing(true);
    try {
      const result = await FulfillmentService.bulkUpdateFulfillmentStatus(Array.from(selectedOrders), 'shipped');
      if (result.success) { alert(`${result.count} orders marked as shipped`); await loadOrders(); deselectAll(); }
      else alert('Failed to update orders');
    } catch { alert('Failed to update orders'); }
    finally { setProcessing(false); }
  }, [selectedOrders, loadOrders, deselectAll]);

  const handleCreateSingleShipment = useCallback(async (order: FulfillmentOrder) => {
    const weightGrams = Math.max(100, Math.round(order.total_weight_kg * 1000));
    setProcessing(true);
    try {
      const result = await ShippingService.createShipment({
        order_id: order.id, carrier: 'dhl', service_type: 'standard', weight_grams: weightGrams,
        recipient_name: order.customer_name, recipient_company_name: order.company_name || undefined,
        recipient_address: order.delivery_address, recipient_city: order.delivery_city,
        recipient_postcode: order.delivery_postcode, recipient_phone: order.customer_phone || '',
        recipient_email: order.customer_email,
      });
      if (result.success) {
        alert('DHL shipment created successfully. Label is ready for printing.');
        setManualResult({
          trackingNumber: result.shipment?.tracking_number ?? undefined,
          shipmentNumber: result.shipment?.shipment_number ?? undefined,
          labelUrl: result.shipment?.label_url ?? undefined
        });
        setSuccessOrderData({
          orderNumber: order.order_number,
          customerName: order.customer_name,
          address: order.delivery_address + ', ' + order.delivery_city,
          weight: String(order.total_weight_kg),
          carrier: 'DHL'
        });
        await loadOrders();
      }
      else alert(`Shipment creation failed:\n${result.error}`);
    } catch { alert('Failed to create shipment'); }
    finally { setProcessing(false); }
  }, [loadOrders]);

  const handleDeleteShipment = useCallback(async (shipmentId: string) => {
    if (!confirm('Cancel and Void this shipment? This will attempt to delete the label from DHL and revert the order status.')) return;
    setProcessing(true);
    try {
      const result = await ShippingService.deleteShipment(shipmentId);
      if (result.success) { alert('Shipment voided and deleted successfully'); await loadOrders(); }
      else alert(`Failed: ${result.error}`);
    } catch { alert('Failed to delete shipment'); }
    finally { setProcessing(false); }
  }, [loadOrders]);

  const handleRecreateShipment = useCallback(async (order: FulfillmentOrder) => {
    if (!order.shipment) return;
    if (!confirm('Recreate this shipment? The existing one will be deleted and a new one created via DHL.')) return;
    const weightGrams = Math.max(100, Math.round(order.total_weight_kg * 1000));
    setProcessing(true);
    try {
      const result = await ShippingService.recreateShipment(order.shipment.id, {
        order_id: order.id, carrier: 'dhl', service_type: 'standard', weight_grams: weightGrams,
        recipient_name: order.customer_name, recipient_company_name: order.company_name || undefined,
        recipient_address: order.delivery_address, recipient_city: order.delivery_city,
        recipient_postcode: order.delivery_postcode, recipient_phone: order.customer_phone || '',
        recipient_email: order.customer_email,
      });
      if (result.success) { alert('Shipment recreated successfully'); await loadOrders(); }
      else alert(`Failed: ${result.error}`);
    } catch { alert('Failed to recreate shipment'); }
    finally { setProcessing(false); }
  }, [loadOrders]);

  const formatCurrency = (amount: number) => `£${Number(amount).toFixed(2)}`;

  const stats = useMemo(() => ({
    readyCount: orders.filter(o => o.fulfillment_status === 'ready_to_ship').length,
    shippedCount: orders.filter(o => o.fulfillment_status === 'shipped' && o.shipment).length,
    withLabels: orders.filter(o => o.shipment?.label_url).length,
    totalValue: orders.reduce((sum, o) => sum + o.total, 0),
    inTransitCount: orders.filter(o => o.shipment?.status === 'in_transit' || o.shipment?.status === 'collected').length,
    atDepotCount: orders.filter(o => o.shipment?.status === 'at_local_depot' || o.shipment?.status === 'arrived_at_depot').length,
    outForDeliveryCount: orders.filter(o => o.shipment?.status === 'out_for_delivery').length,
    deliveredCount: orders.filter(o => o.shipment?.status === 'delivered').length,
  }), [orders]);

  const bulkActions = useMemo(() => [
    { id: 'create-shipments', label: 'Create DHL Shipments', icon: '📦', onClick: handleBulkCreateShipments, variant: 'primary' as const, disabled: processing || Array.from(selectedOrders).some(id => orders.find(o => o.id === id)?.shipment) },
    { id: 'download-labels', label: 'Print Labels', icon: '🏷️', onClick: handleBulkDownloadLabels, variant: 'secondary' as const, disabled: processing || Array.from(selectedOrders).every(id => !orders.find(o => o.id === id)?.shipment?.label_url) },
    { id: 'mark-shipped', label: 'Mark as Shipped', icon: '🚚', onClick: handleBulkMarkShipped, variant: 'success' as const, disabled: processing },
  ], [selectedOrders, orders, processing, handleBulkCreateShipments, handleBulkDownloadLabels, handleBulkMarkShipped]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
      <div className="w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <span className="text-3xl sm:text-4xl">🚚</span>
              Shipping Management
            </h1>
            <p className="text-slate-400">DHL eCommerce UK - Cloud API Integration</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={loadOrders}
              disabled={loading}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all border border-slate-700 text-sm"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => { setExternalOrder(null); setShowExternalModal(true); }}
              className="flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-900/30 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <span className="hidden sm:inline">Record External</span>
              <span className="sm:hidden">External</span>
            </button>
            <button
              onClick={() => window.location.href = '/shipping/calculator'}
              className="flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-900/30 text-sm"
            >
              <span className="text-base">💰</span>
              <span className="hidden sm:inline">Cost Calculator</span>
              <span className="sm:hidden">Calculator</span>
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              className="flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span className="hidden sm:inline">New Manual Shipment</span>
              <span className="sm:hidden">New Shipment</span>
            </button>
          </div>
        </div>

        {/* DHL API Status Banner */}
        <div className={`mb-4 sm:mb-6 rounded-xl border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
          checkingDhl ? 'bg-slate-800/50 border-slate-700/50'
            : dhlStatus?.success ? 'bg-emerald-950/30 border-emerald-800/40'
            : 'bg-amber-950/30 border-amber-800/40'
        }`}>
          <div className="flex items-center gap-3 flex-1">
          <div className={`w-3 h-3 rounded-full shrink-0 ${
            checkingDhl ? 'bg-slate-500 animate-pulse'
              : dhlStatus?.success ? 'bg-emerald-400'
              : 'bg-amber-400'
          }`} />
          <div className="flex-1 min-w-0">
            {checkingDhl ? (
              <span className="text-sm text-slate-400">Checking DHL eCommerce UK API connection...</span>
            ) : dhlStatus?.success ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm text-emerald-300 font-medium">DHL eCommerce UK Cloud API Connected</span>
                <span className="text-xs text-slate-400 hidden sm:inline">Account: {dhlStatus.accountNumber} | Pickup: {dhlStatus.pickupAccount} | Environment: Production</span>
              </div>
            ) : (
              <div>
                <span className="text-sm text-amber-300 font-medium">DHL API Connection Issue</span>
                <span className="text-xs text-amber-400/70 ml-2">{dhlStatus?.error}</span>
              </div>
            )}
          </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="text-xs text-slate-500 font-mono hidden md:inline">Next Day Service</span>
            <button
              onClick={runDiagnostic}
              disabled={checkingDhl}
              className="text-xs px-2 py-1 bg-slate-800 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 transition-all rounded border border-slate-700"
              title="Run deep diagnostic check"
            >
              Run Diagnostic
            </button>
            <button
              onClick={checkDhlStatus}
              disabled={checkingDhl}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 p-1 hover:bg-slate-700/50 rounded"
              title="Refresh DHL connection status"
            >
              <svg className={`w-3.5 h-3.5 ${checkingDhl ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fulfillment Pipeline Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            { label: 'Pending Pick', value: fullStats?.pending || 0, color: 'text-slate-400', icon: '📋' },
            { label: 'Picking', value: fullStats?.picking || 0, color: 'text-blue-400', icon: '⛏️' },
            { label: 'Packing', value: fullStats?.packing || 0, color: 'text-orange-400', icon: '📦' },
            { label: 'Ready to Ship', value: fullStats?.ready_to_ship || 0, color: 'text-purple-400', icon: '🚚' },
            { label: 'In Transit', value: fullStats?.shipped || 0, color: 'text-cyan-400', icon: '🚛' },
            { label: 'Delivered', value: fullStats?.delivered || 0, color: 'text-emerald-400', icon: '✅' },
            { label: 'Total Value', value: stats.totalValue ? `£${stats.totalValue.toFixed(0)}` : '£0', color: 'text-emerald-500', icon: '💰' },
          ].map(s => (
            <div key={s.label} className="ch-card bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-3 sm:p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{s.label}</span>
                <span className="text-lg sm:text-xl">{s.icon}</span>
              </div>
              <div className={`text-xl sm:text-2xl font-black ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Performance Metrics & Failed Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Performance KPIs */}
          <div className="ch-card lg:col-span-2 bg-slate-900/50 rounded-3xl border border-slate-800 p-4 sm:p-6">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 sm:mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></span>
              Performance Metrics
            </h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Avg Picking Time</p>
                <p className="text-2xl font-black text-white">{fullStats?.avg_picking_time || '0m'}</p>
                <p className="text-[10px] text-emerald-500 mt-1">↑ 12% faster today</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Avg Packing Time</p>
                <p className="text-2xl font-black text-white">{fullStats?.avg_packing_time || '0m'}</p>
                <p className="text-[10px] text-slate-500 mt-1">Stable performance</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Dispatch Speed</p>
                <p className="text-2xl font-black text-white">18m</p>
                <p className="text-[10px] text-slate-500 mt-1">Order to DHL Booked</p>
              </div>
            </div>
          </div>

          {/* Failed Shipment Queue Trigger */}
          <div className={`rounded-3xl border p-4 sm:p-6 flex flex-col justify-between transition-all ${
            fullStats?.failed_shipments > 0
              ? 'bg-rose-950/20 border-rose-500/30'
              : 'bg-slate-900/50 border-slate-800 opacity-60'
          }`}>
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Failed Shipments</h3>
                <span className="text-2xl">⚠️</span>
              </div>
              <p className={`text-3xl sm:text-4xl font-black ${fullStats?.failed_shipments > 0 ? 'text-rose-500' : 'text-slate-600'}`}>
                {fullStats?.failed_shipments || 0}
              </p>
              <p className="text-xs text-slate-500 mt-2">Shipments rejected by DHL requiring manual review</p>
            </div>
            {fullStats?.failed_shipments > 0 && (
              <button
                onClick={() => setFilter('failed')}
                className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Review Failures
              </button>
            )}
          </div>
        </div>

        {/* Orders table */}
        <div className="ch-card bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-100">Orders for Shipment</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All', count: orders.length },
                { id: 'packing', label: 'Packing', count: orders.filter(o => o.fulfillment_status === 'packing').length },
                { id: 'packed', label: 'Packed', count: orders.filter(o => o.fulfillment_status === 'packed').length },
                { id: 'ready_to_ship', label: 'Ready', count: orders.filter(o => o.fulfillment_status === 'ready_to_ship').length },
                { id: 'shipped', label: 'Shipped', count: orders.filter(o => o.fulfillment_status === 'shipped' && o.shipment).length },
                { id: 'in_transit', label: 'In Transit', count: orders.filter(o => o.shipment?.status === 'in_transit' || o.shipment?.status === 'collected').length },
                { id: 'at_local_depot', label: 'At Depot', count: orders.filter(o => o.shipment?.status === 'at_local_depot' || o.shipment?.status === 'arrived_at_depot').length },
                { id: 'out_for_delivery', label: 'Out for Delivery', count: orders.filter(o => o.shipment?.status === 'out_for_delivery').length },
                { id: 'failed', label: 'Failed', count: fullStats?.failed_shipments || 0 },
              ].map(btn => (
                <button key={btn.id} onClick={() => setFilter(btn.id)} className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  filter === btn.id
                    ? (btn.id === 'failed' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30')
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
                }`}>
                  {btn.label} ({btn.count})
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonLoader variant="list" count={5} />
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl sm:text-6xl mb-4 opacity-50">📦</div>
              <p className="text-slate-400 mb-4">No orders ready for shipping</p>
              <button onClick={() => setShowManualModal(true)} className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2">
                Create a manual shipment instead
              </button>
            </div>
          ) : (
            <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/50">
                    <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <input type="checkbox"
                        checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                        onChange={e => e.target.checked ? selectAll() : deselectAll()}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
                      />
                    </th>
                    {['Order', 'Customer', 'Destination', 'Status', 'Tracking', 'Delivery', 'Shipping', 'Order Total', 'Actions'].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleSelection(order.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100 text-sm">{order.order_number}</div>
                        <div className="text-xs text-slate-500">{mounted ? new Date(order.created_at).toLocaleDateString('en-GB') : '...'}</div>
                      </td>
                      <td className="p-3">
                        {order.company_name && <div className="text-sm font-medium text-blue-400 mb-0.5">{order.company_name}</div>}
                        <div className="text-sm text-slate-200">{order.customer_name}</div>
                        <div className="text-xs text-slate-500">{order.customer_email}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-slate-200">{order.delivery_address}</div>
                        <div className="text-sm text-slate-300">{order.delivery_city}</div>
                        <div className="text-xs text-slate-400 font-mono">{order.delivery_postcode}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${FulfillmentService.getStatusColor(order.fulfillment_status)}`}>
                          {FulfillmentService.getStatusLabel(order.fulfillment_status)}
                        </span>
                      </td>
                      <td className="p-3">
                        {order.shipment ? (
                          <div>
                            <div className={`text-sm font-semibold ${order.shipment.status === 'failed' ? 'text-rose-500' : 'text-blue-400'}`}>
                              {order.shipment.status === 'failed' ? 'BOOKING FAILED' : order.shipment.shipment_number}
                            </div>
                            {order.shipment.tracking_number && <div className="text-xs font-mono text-emerald-400">{order.shipment.tracking_number}</div>}
                            {order.shipment.status === 'failed' && order.shipment.error_message && (
                              <div className="text-[10px] text-rose-400/80 leading-tight mt-1 max-w-[150px] truncate" title={order.shipment.error_message}>
                                {order.shipment.error_message}
                              </div>
                            )}
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              {(order.shipment as any).metadata?.source === 'external' ? (
                                <span className="text-amber-400 font-medium">External (DHL Site)</span>
                              ) : (
                                <span>DHL eCommerce UK</span>
                              )}
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-500">No shipment</span>}
                      </td>
                      <td className="p-3">
                        {order.shipment ? (() => { const badge = getDeliveryStatusBadge(order.shipment?.status); return (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.classes}`}>{badge.label}</span>
                            {order.shipment.tracking_number && (
                              <button
                                onClick={() => handleRefreshTracking(order.shipment!.id)}
                                disabled={refreshing.has(order.shipment!.id)}
                                className="text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
                                title="Refresh from DHL"
                              >
                                {refreshing.has(order.shipment!.id) ? (
                                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                )}
                              </button>
                            )}
                          </div>
                        ); })() : <span className="text-xs text-slate-500">-</span>}
                      </td>
                      <td className="p-3">
                        {order.shipment ? (
                          <div>
                            <div className="text-sm font-semibold text-cyan-400">{formatCurrency(order.shipment.shipping_cost / 100)}</div>
                            <div className="text-xs text-slate-500">Next Day</div>
                          </div>
                        ) : <span className="text-xs text-slate-500">-</span>}
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-semibold text-emerald-400">{formatCurrency(order.total)}</div>
                      </td>
                      <td className="p-3">
                        {!order.shipment ? (
                          <div className="flex gap-1.5 flex-wrap">
                            <button onClick={() => handleCreateSingleShipment(order)} disabled={processing}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50">
                              Create Shipment
                            </button>
                            <button onClick={() => { setExternalOrder(order); setShowExternalModal(true); }} disabled={processing}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50">
                              Record External
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {order.shipment.label_url && (
                              <button onClick={() => openLabel(order.shipment!.label_url)}
                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-all">
                                Print Label
                              </button>
                            )}
                            {order.shipment.tracking_number && (
                              <button
                                onClick={() => handleRefreshTracking(order.shipment!.id)}
                                disabled={refreshing.has(order.shipment!.id)}
                                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                              >
                                {refreshing.has(order.shipment!.id) ? (
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                ) : null}
                                Refresh
                              </button>
                            )}
                            <button onClick={() => handleRecreateShipment(order)} disabled={processing}
                              className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50">
                              Recreate
                            </button>
                            <button onClick={() => handleDeleteShipment(order.shipment!.id)} disabled={processing}
                              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50">
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-800/50">
                  <input type="checkbox"
                    checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                    onChange={e => e.target.checked ? selectAll() : deselectAll()}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Select All</span>
                </div>
                {filteredOrders.map(order => (
                  <div key={order.id} className={`rounded-xl border p-4 transition-colors ${selectedOrders.has(order.id) ? 'border-blue-500/30 bg-blue-950/20' : 'border-slate-800/50 bg-slate-900/30'}`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleSelection(order.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-100 text-sm">{order.order_number}</div>
                          <div className="text-xs text-slate-500">{mounted ? new Date(order.created_at).toLocaleDateString() : '...'}</div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border shrink-0 ${FulfillmentService.getStatusColor(order.fulfillment_status)}`}>
                        {FulfillmentService.getStatusLabel(order.fulfillment_status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Customer</p>
                        {order.company_name && <div className="text-sm font-medium text-blue-400">{order.company_name}</div>}
                        <div className="text-sm text-slate-200">{order.customer_name}</div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Destination</p>
                        <div className="text-sm text-slate-200 truncate">{order.delivery_address}</div>
                        <div className="text-sm text-slate-300">{order.delivery_city}</div>
                        <div className="text-xs text-slate-400 font-mono">{order.delivery_postcode}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tracking</p>
                        {order.shipment ? (
                          <div>
                            <div className={`text-sm font-semibold ${order.shipment.status === 'failed' ? 'text-rose-500' : 'text-blue-400'}`}>
                              {order.shipment.status === 'failed' ? 'BOOKING FAILED' : order.shipment.shipment_number}
                            </div>
                            {order.shipment.tracking_number && <div className="text-xs font-mono text-emerald-400">{order.shipment.tracking_number}</div>}
                            {(order.shipment as any).metadata?.source === 'external' && (
                              <span className="text-xs text-amber-400 font-medium">External</span>
                            )}
                          </div>
                        ) : <span className="text-xs text-slate-500">No shipment</span>}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total</p>
                        <div className="text-sm font-semibold text-emerald-400">{formatCurrency(order.total)}</div>
                        {order.shipment && (
                          <div className="text-xs text-cyan-400">{formatCurrency(order.shipment.shipping_cost / 100)} shipping</div>
                        )}
                      </div>
                    </div>
                    {order.shipment && (() => { const badge = getDeliveryStatusBadge(order.shipment?.status); return (
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Delivery Status</p>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.classes}`}>{badge.label}</span>
                      </div>
                      {order.shipment.tracking_number && (
                        <button
                          onClick={() => handleRefreshTracking(order.shipment!.id)}
                          disabled={refreshing.has(order.shipment!.id)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {refreshing.has(order.shipment!.id) ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          )}
                          Refresh
                        </button>
                      )}
                    </div>
                    ); })()}

                    <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-800/50">
                      {!order.shipment ? (
                        <>
                          <button onClick={() => handleCreateSingleShipment(order)} disabled={processing}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex-1">
                            Create Shipment
                          </button>
                          <button onClick={() => { setExternalOrder(order); setShowExternalModal(true); }} disabled={processing}
                            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex-1">
                            Record External
                          </button>
                        </>
                      ) : (
                        <>
                          {order.shipment.label_url && (
                            <button onClick={() => openLabel(order.shipment!.label_url)}
                              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-all flex-1">
                              Print Label
                            </button>
                          )}
                          {order.shipment.tracking_number && (
                            <button
                              onClick={() => handleRefreshTracking(order.shipment!.id)}
                              disabled={refreshing.has(order.shipment!.id)}
                              className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex-1 flex items-center justify-center gap-1"
                            >
                              {refreshing.has(order.shipment!.id) ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                              ) : null}
                              Refresh
                            </button>
                          )}
                          <button onClick={() => handleRecreateShipment(order)} disabled={processing}
                            className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex-1">
                            Recreate
                          </button>
                          <button onClick={() => handleDeleteShipment(order.shipment!.id)} disabled={processing}
                            className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex-1">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>


      {showExternalModal && (
        <ExternalShipmentModal
          order={externalOrder}
          onClose={() => { setShowExternalModal(false); setExternalOrder(null); }}
          onSuccess={() => { setShowExternalModal(false); setExternalOrder(null); loadOrders(); }}
        />
      )}

      {showManualModal && (
        <ManualShipmentModal
          onClose={() => setShowManualModal(false)}
          onSuccess={(result, formData) => {
            setShowManualModal(false);
            setManualResult(result);
            setSuccessOrderData({
              orderNumber: formData.reference || 'MANUAL',
              customerName: formData.recipientName,
              address: formData.recipientAddress1 + (formData.recipientAddress2 ? ', ' + formData.recipientAddress2 : '') + ', ' + formData.recipientCity,
              weight: formData.weightKg,
              carrier: 'DHL'
            });
          }}
        />
      )}

      {manualResult && (
        <ShipmentSuccessModal
          result={manualResult}
          orderData={successOrderData}
          onClose={() => {
            setManualResult(null);
            setSuccessOrderData(null);
          }}
        />
      )}
    </div>
  );
}
