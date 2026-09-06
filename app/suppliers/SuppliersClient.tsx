'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supplierService, Supplier } from '@/lib/services/suppliers/supplierService';

export default function SuppliersClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newSupplier, setNewSupplier] = useState({
    name: '',
    code: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    city: '',
    country: '',
    payment_terms: 'Net 30',
    currency: 'USD',
  });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    const data = await supplierService.getAllSuppliers(activeOnly);
    setSuppliers(data);
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.code ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.country?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await supplierService.createSupplier(newSupplier);
    if (result.data) {
      setShowCreateModal(false);
      setNewSupplier({
        name: '',
        code: '',
        contact_email: '',
        contact_phone: '',
        address: '',
        city: '',
        country: '',
        payment_terms: 'Net 30',
        currency: 'USD',
      });
      loadSuppliers();
    } else if (result.error) {
      alert(`Failed to create supplier: ${result.error}`);
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-400';
    if (rating >= 3) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sticky top-14 fold-inner:static z-20 bg-slate-950/80 backdrop-blur-md fold-inner:bg-transparent -mx-4 px-4 py-3 mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b fold-inner:border-0 border-slate-800/50">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-white mb-1 uppercase tracking-tighter">Suppliers</h1>
          <p className="text-slate-400 text-[10px] sm:text-sm uppercase font-black tracking-widest">
            Partners & Procurement
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20"
        >
          + Add Supplier
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search partners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>
        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
            activeOnly
              ? 'bg-cyan-600/10 text-cyan-400 border-cyan-500/30'
              : 'bg-slate-800 text-slate-500 border-transparent hover:border-slate-700'
          }`}
        >
          {activeOnly ? 'Active Only' : 'Show All'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4 font-bold uppercase text-[10px] tracking-widest">Scanning Partner Network...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 fold-inner:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredSuppliers.map((supplier) => (
            <Link
              key={supplier.id}
              href={`/suppliers/${supplier.id}`}
              className="block bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-cyan-500 transition-all hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-1">
                    {supplier.name}
                  </h3>
                  <p className="text-sm text-slate-400">{supplier.code}</p>
                </div>
                {!supplier.is_active && (
                  <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">
                    Inactive
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {supplier.contact_email && (
                  <div className="flex items-center text-sm text-slate-400">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {supplier.contact_email}
                  </div>
                )}
                {supplier.country && (
                  <div className="flex items-center text-sm text-slate-400">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {supplier.city}, {supplier.country}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <div>
                  <p className="text-xs text-slate-500">Rating</p>
                  <div className="flex items-center">
                    <span className={`text-lg font-semibold ${getRatingColor(supplier.rating ?? 0)}`}>
                      {(supplier.rating ?? 0).toFixed(1)}
                    </span>
                    <span className="text-slate-500 ml-1">/5.0</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Payment Terms</p>
                  <p className="text-sm text-white">{supplier.payment_terms}</p>
                </div>
              </div>
            </Link>
          ))}

          {filteredSuppliers.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">
              No suppliers found
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Add New Supplier</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSupplier.name}
                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Supplier Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSupplier.code}
                    onChange={(e) => setNewSupplier({ ...newSupplier, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newSupplier.contact_email}
                    onChange={(e) => setNewSupplier({ ...newSupplier, contact_email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newSupplier.contact_phone}
                    onChange={(e) => setNewSupplier({ ...newSupplier, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={newSupplier.city}
                    onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={newSupplier.country}
                    onChange={(e) => setNewSupplier({ ...newSupplier, country: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Payment Terms
                  </label>
                  <select
                    value={newSupplier.payment_terms}
                    onChange={(e) => setNewSupplier({ ...newSupplier, payment_terms: e.target.value })}
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
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Currency
                  </label>
                  <select
                    value={newSupplier.currency}
                    onChange={(e) => setNewSupplier({ ...newSupplier, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                >
                  Create Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
