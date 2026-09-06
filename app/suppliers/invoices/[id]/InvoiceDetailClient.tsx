'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { invoiceService, SupplierInvoice } from '@/lib/services/invoiceService';
import { supplierService, Supplier } from '@/lib/services/suppliers/supplierService';
import { supabase } from '@/lib/supabase';
import InvoiceImportModal from '@/components/InvoiceImportModal';

interface DraftItem {
  product_name: string;
  product_id?: string | null;
  packs: number;
  pack_size: number;
  units_total: number;
  cost_per_pack: number;
  total_cost: number;
}

export default function InvoiceDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;
  const isNew = invoiceId === 'new';

  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    invoice_number: '',
    supplier_id: '',
    store_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    tax_amount: 0,
    shipping_cost: 0,
    currency: 'USD',
    notes: '',
  });

  const [items, setItems] = useState<DraftItem[]>([
    { product_name: '', packs: 0, pack_size: 1, units_total: 0, cost_per_pack: 0, total_cost: 0 },
  ]);

  const [poDrafts, setPoDrafts] = useState<{ id: string; total_amount: number; draft_items: any; trigger_reason: string | null; store_id?: string }[]>([]);
  const [selectedPoDraftId, setSelectedPoDraftId] = useState('');

  const loadData = useCallback(async () => {
    if (!invoiceId || invoiceId === '__placeholder') {
       setLoading(false);
       return;
    }
    setLoading(true);
    const [suppliersData, storesData] = await Promise.all([
      supplierService.getAllSuppliers(false),
      supabase.from('stores').select('id, name')
    ]);
    setSuppliers(suppliersData);
    setStores(storesData.data || []);

    if (!isNew) {
      const inv = await invoiceService.getInvoiceById(invoiceId);
      if (inv) {
        setInvoice(inv);
        setForm({
          invoice_number: inv.invoice_number,
          supplier_id: inv.supplier_id,
          store_id: inv.store_id || '',
          invoice_date: inv.invoice_date,
          due_date: inv.due_date || '',
          tax_amount: inv.tax_amount,
          shipping_cost: inv.shipping_cost,
          currency: inv.currency,
          notes: inv.notes || '',
        });
        if (inv.items && inv.items.length > 0) {
          setItems(inv.items.map(it => ({
            product_name: it.product_name,
            packs: it.packs,
            pack_size: it.pack_size,
            units_total: it.quantity,
            cost_per_pack: it.unit_cost * it.pack_size,
            total_cost: it.line_total,
          })));
        }
      }
    }
    setLoading(false);
  }, [invoiceId, isNew]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadPoDrafts = useCallback(async (supplierId: string) => {
    if (!supplierId) { setPoDrafts([]); return; }
    const drafts = await invoiceService.getPODraftsForSupplier(supplierId);
    setPoDrafts(drafts);
  }, []);

  useEffect(() => {
    if (form.supplier_id) loadPoDrafts(form.supplier_id);
  }, [form.supplier_id, loadPoDrafts]);

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const subtotal = items.reduce((sum, i) => sum + i.total_cost, 0);
  const total = subtotal + (form.tax_amount || 0) + (form.shipping_cost || 0);
  const outstanding = invoice ? invoice.total_amount - invoice.amount_paid : total;

  const updateItem = (index: number, field: keyof DraftItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      const item = updated[index];
      item.units_total = item.packs * item.pack_size;
      item.total_cost = item.packs * item.cost_per_pack;
      return updated;
    });
  };

  const addRow = () => {
    setItems(prev => [...prev, { product_name: '', packs: 0, pack_size: 1, units_total: 0, cost_per_pack: 0, total_cost: 0 }]);
  };

  const removeRow = (index: number) => {
    setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  const handleLoadPoDraft = (draftId: string) => {
    setSelectedPoDraftId(draftId);
    const draft = poDrafts.find(d => d.id === draftId);
    if (!draft || !draft.draft_items) return;

    if (draft.store_id) {
      setForm(prev => ({ ...prev, store_id: draft.store_id || '' }));
    }

    setItems(draft.draft_items.map((di: any) => ({
      product_name: di.product_name || 'Unknown',
      packs: di.packs || 0,
      pack_size: di.pack_size || 1,
      units_total: di.units_total || (di.packs || 0) * (di.pack_size || 1),
      cost_per_pack: di.cost_per_pack || 0,
      total_cost: di.total_cost || 0,
    })));
  };

  const handleSave = async () => {
    if (!form.invoice_number || !form.supplier_id) return;
    setSaving(true);

    const validItems = items.filter(i => i.product_name && i.packs > 0);

    const id = await invoiceService.createInvoice({
      invoice_number: form.invoice_number,
      supplier_id: form.supplier_id,
      po_draft_id: selectedPoDraftId || null,
      store_id: form.store_id || null,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      tax_amount: form.tax_amount,
      shipping_cost: form.shipping_cost,
      currency: form.currency,
      notes: form.notes,
      items: validItems.map(i => ({
        product_id: i.product_id || null,
        product_name: i.product_name,
        quantity: i.units_total,
        unit_cost: i.pack_size > 0 ? i.cost_per_pack / i.pack_size : i.cost_per_pack,
        pack_size: i.pack_size,
        packs: i.packs,
      })),
    });

    setSaving(false);
    if (id) {
      router.push('/suppliers/invoices');
    } else {
      alert('Failed to create invoice. Check console for details.');
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!invoice) return;
    const success = await invoiceService.updateInvoiceStatus(invoice.id, status);
    if (success) {
      loadData();
    }
  };

  const handlePayment = async () => {
    if (!invoice || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    const success = await invoiceService.recordPayment(invoice.id, amount);
    if (success) {
      setShowPaymentModal(false);
      setPayAmount('');
      loadData();
    }
  };

  const handleUpdateReceived = async (itemId: string, receivedQty: number) => {
    await invoiceService.updateItemReceivedQty(itemId, receivedQty);
    loadData();
  };

  const handleDelete = async () => {
    if (!invoice) return;
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    const success = await invoiceService.deleteInvoice(invoice.id);
    if (success) router.push('/suppliers/invoices');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !invoice) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${invoice.id}_${Date.now()}.${fileExt}`;
      const filePath = `invoices/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('supplier_invoices')
        .update({ file_url: publicUrl })
        .eq('id', invoice.id);

      if (updateError) throw updateError;

      loadData();
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Failed to upload file: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const STATUS_FLOW = ['draft', 'received', 'approved', 'paid'];
  const currentStep = invoice ? STATUS_FLOW.indexOf(invoice.status) : -1;

  if (loading && invoiceId !== '__placeholder') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (invoiceId === '__placeholder') {
     return <div className="p-12 text-center text-slate-500">Placeholder</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/suppliers/invoices" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">
          ← Back to Invoices
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            {isNew ? 'New Supplier Invoice' : `Invoice ${invoice?.invoice_number || ''}`}
          </h1>
          {!isNew && invoice && (
            <p className="text-slate-400">
              {invoice.supplier_name} - {formatCurrency(invoice.total_amount, invoice.currency)}
            </p>
          )}
        </div>
        {!isNew && invoice && (
          <div className="flex gap-2 flex-wrap">
            {invoice.file_url ? (
              <a
                href={invoice.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-sm font-medium transition-colors border border-slate-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Invoice
              </a>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,image/*"
            />
            {invoice.status === 'draft' && (
              <button onClick={() => handleStatusChange('received')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                Mark Received
              </button>
            )}
            {invoice.status === 'received' && (
              <button onClick={() => handleStatusChange('approved')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
                Approve Invoice
              </button>
            )}
            {invoice.status === 'approved' && (
              <button onClick={() => setShowPaymentModal(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                Record Payment
              </button>
            )}
            {invoice.status !== 'disputed' && invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <button onClick={() => handleStatusChange('disputed')} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30">
                Dispute
              </button>
            )}
            <button onClick={handleDelete} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Status Progress (existing invoices) */}
      {!isNew && invoice && (
        <div className="mb-6 flex items-center gap-2">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                i <= currentStep
                  ? s === 'paid' ? 'bg-green-500/20 text-green-400' :
                    s === 'approved' ? 'bg-cyan-500/20 text-cyan-400' :
                    s === 'received' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-500/20 text-slate-400'
                  : 'bg-slate-800 text-slate-600 border border-slate-700'
              }`}>
                {s}
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <div className={`w-4 sm:w-8 h-0.5 ${i < currentStep ? 'bg-cyan-500' : 'bg-slate-700'}`}></div>
              )}
            </div>
          ))}
          {invoice.status === 'disputed' && (
            <span className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">disputed</span>
          )}
        </div>
      )}

      {/* Form */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-6 space-y-6">
        {/* Invoice Details */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Invoice Number *</label>
              <input
                type="text"
                required
                disabled={!isNew}
                value={form.invoice_number}
                onChange={e => setForm({ ...form, invoice_number: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Supplier *</label>
              <select
                required
                disabled={!isNew}
                value={form.supplier_id}
                onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              >
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Store Allocation</label>
              <select
                disabled={!isNew}
                value={form.store_id}
                onChange={e => setForm({ ...form, store_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              >
                <option value="">Global / Unallocated</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Currency</label>
              <select
                disabled={!isNew}
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              >
                {['USD', 'EUR', 'GBP', 'JPY', 'CNY'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Invoice Date</label>
              <input
                type="date"
                disabled={!isNew}
                value={form.invoice_date}
                onChange={e => setForm({ ...form, invoice_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Due Date</label>
              <input
                type="date"
                disabled={!isNew}
                value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                placeholder="Auto-calculated from supplier terms"
              />
            </div>
            {isNew && form.supplier_id && poDrafts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Link to PO Draft (optional)</label>
                <select
                  value={selectedPoDraftId}
                  onChange={e => handleLoadPoDraft(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">No PO draft</option>
                  {poDrafts.map(d => (
                    <option key={d.id} value={d.id}>
                      {formatCurrency(d.total_amount)} - {d.trigger_reason?.slice(0, 40) || 'Draft'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Line Items</h2>
            {isNew && (
              <div className="flex gap-2">
                <button
                  onClick={() => form.supplier_id ? setShowImportModal(true) : alert('Select a supplier first')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import File
                </button>
                <button onClick={addRow} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors">
                  + Add Row
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="px-3 py-3 font-medium">Product Name</th>
                  <th className="px-3 py-3 font-medium text-center">Packs</th>
                  <th className="px-3 py-3 font-medium text-center">Pack Size</th>
                  <th className="px-3 py-3 font-medium text-center">Units</th>
                  <th className="px-3 py-3 font-medium text-right">Cost/Pack</th>
                  <th className="px-3 py-3 font-medium text-right">Line Total</th>
                  {!isNew && <th className="px-3 py-3 font-medium text-center">Received</th>}
                  {isNew && <th className="px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="px-3 py-3">
                      {isNew ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.product_name}
                            onChange={e => updateItem(i, 'product_name', e.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
                          />
                          {item.product_id ? (
                            <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                               Matched to Central Catalog
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic">Unmatched (Free Text)</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-white">{item.product_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isNew ? (
                        <input
                          type="number"
                          min="0"
                          value={item.packs}
                          onChange={e => updateItem(i, 'packs', parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-center focus:outline-none focus:border-cyan-500"
                        />
                      ) : (
                        <span className="text-slate-300">{item.packs}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isNew ? (
                        <input
                          type="number"
                          min="1"
                          value={item.pack_size}
                          onChange={e => updateItem(i, 'pack_size', parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-center focus:outline-none focus:border-cyan-500"
                        />
                      ) : (
                        <span className="text-slate-300">{item.pack_size}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-300">{item.units_total}</td>
                    <td className="px-3 py-3 text-right">
                      {isNew ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.cost_per_pack}
                          onChange={e => updateItem(i, 'cost_per_pack', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-right focus:outline-none focus:border-cyan-500"
                        />
                      ) : (
                        <span className="text-slate-300">{formatCurrency(item.cost_per_pack, form.currency)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-white font-semibold">
                      {formatCurrency(item.total_cost, form.currency)}
                    </td>
                    {!isNew && invoice?.items && invoice.items[i] && (
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={invoice.items[i]!.received_quantity}
                          onChange={e => handleUpdateReceived(invoice.items[i]!.id, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-center focus:outline-none focus:border-cyan-500"
                        />
                      </td>
                    )}
                    {isNew && (
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Additional Costs & Notes</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Tax Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isNew}
                    value={form.tax_amount}
                    onChange={e => setForm({ ...form, tax_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Shipping Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isNew}
                    value={form.shipping_cost}
                    onChange={e => setForm({ ...form, shipping_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Notes</label>
                <textarea
                  disabled={!isNew}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          <div className="sm:ml-auto sm:w-64">
            <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-white">{formatCurrency(subtotal, form.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Tax</span>
                <span className="text-white">{formatCurrency(form.tax_amount || 0, form.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Shipping</span>
                <span className="text-white">{formatCurrency(form.shipping_cost || 0, form.currency)}</span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between">
                <span className="text-white font-semibold">Total</span>
                <span className="text-cyan-400 font-bold text-lg">{formatCurrency(total, form.currency)}</span>
              </div>
              {!isNew && invoice && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Paid</span>
                    <span className="text-green-400">{formatCurrency(invoice.amount_paid, form.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Outstanding</span>
                    <span className={outstanding > 0 ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                      {formatCurrency(outstanding, form.currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        {isNew && (
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <button
              onClick={() => router.push('/suppliers/invoices')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.invoice_number || !form.supplier_id}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Create Invoice'}
            </button>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && invoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Record Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                <p>Outstanding: <span className="text-amber-400 font-medium">{formatCurrency(outstanding, invoice.currency)}</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Payment Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                onClick={handlePayment}
                disabled={!payAmount}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Import Modal */}
      {showImportModal && (
        <InvoiceImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          supplierId={form.supplier_id}
          onImport={(importedItems) => {
            if (items.length === 1 && !items[0].product_name) {
              setItems(importedItems);
            } else {
              setItems([...items, ...importedItems]);
            }
          }}
        />
      )}
    </div>
  );
}
