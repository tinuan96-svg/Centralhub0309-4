'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supplierService, Supplier } from '@/lib/services/suppliers/supplierService';

export default function SupplierDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    name: '',
    code: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    city: '',
    country: '',
    payment_terms: 'Net 30',
    currency: 'USD',
    rating: 0,
    notes: '',
    is_active: true,
  });

  const loadSupplier = useCallback(async () => {
    if (!supplierId || supplierId === '__placeholder' || supplierId === 'new') {
       setLoading(false);
       return;
    }
    setLoading(true);
    const data = await supplierService.getSupplierById(supplierId);
    if (!data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setSupplier(data);
    setForm({
      name: data.name || '',
      code: data.code || '',
      contact_email: data.contact_email || '',
      contact_phone: data.contact_phone || '',
      address: data.address || '',
      city: data.city || '',
      country: data.country || '',
      payment_terms: data.payment_terms || 'Net 30',
      currency: data.currency || 'USD',
      rating: data.rating ?? 0,
      notes: data.notes || '',
      is_active: data.is_active,
    });
    setLoading(false);
  }, [supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  const handleSave = async () => {
    if (!supplier) return;
    setSaving(true);
    setSaveError('');
    const result = await supplierService.updateSupplier(supplier.id, {
      name: form.name,
      code: form.code,
      contact_email: form.contact_email || undefined,
      contact_phone: form.contact_phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      payment_terms: form.payment_terms,
      currency: form.currency,
      rating: form.rating,
      notes: form.notes || undefined,
      is_active: form.is_active,
    });
    setSaving(false);
    if (result.success) {
      router.push('/suppliers');
    } else {
      setSaveError(`Failed to save changes: ${result.error || 'Unknown error'}`);
    }
  };

  const handleToggleActive = async () => {
    if (!supplier) return;
    setSaveError('');
    const newActive = !form.is_active;
    setForm({ ...form, is_active: newActive });
    const result = await supplierService.updateSupplier(supplier.id, { is_active: newActive });
    if (result.success) {
      setSupplier({ ...supplier, is_active: newActive });
    } else {
      setForm({ ...form, is_active: !newActive });
      setSaveError(`Failed to toggle supplier status: ${result.error || 'Unknown error'}`);
    }
  };

  if (loading && supplierId !== '__placeholder') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Loading supplier...</p>
        </div>
      </div>
    );
  }

  if (supplierId === '__placeholder') {
     return <div className="p-12 text-center text-slate-500">Placeholder</div>;
  }

  if (notFound) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Link href="/suppliers" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors mb-4 inline-block">
          ← Back to Suppliers
        </Link>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <span className="text-5xl mb-4 block">🔍</span>
          <h2 className="text-xl font-bold text-slate-200 mb-2">Supplier Not Found</h2>
          <p className="text-sm text-slate-500 mb-4">This supplier may have been deleted or the ID is invalid.</p>
          <Link href="/suppliers" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors inline-block">
            Back to Suppliers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/suppliers" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">
          ← Back to Suppliers
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{form.name || 'Supplier'}</h1>
            <span className={`px-2 py-1 text-xs rounded ${form.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-slate-400">{form.code || 'No code'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleActive}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              form.is_active
                ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {form.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {saveError && (
        <div className="mb-4 px-4 py-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {saveError}
        </div>
      )}

      {/* Edit Form */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-6 space-y-6">
        {/* Basic Info */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Supplier Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Supplier Code</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={e => setForm({ ...form, contact_email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Address</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Street Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Commercial Terms */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Commercial Terms</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Payment Terms</label>
              <select
                value={form.payment_terms}
                onChange={e => setForm({ ...form, payment_terms: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
                <option value="Net 90">Net 90</option>
                <option value="Due on Receipt">Due on Receipt</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Rating (0-5)</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={form.rating}
                onChange={e => setForm({ ...form, rating: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Notes</h2>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Save / Cancel */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={() => router.push('/suppliers')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
