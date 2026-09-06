'use client';

import { useState, useEffect, useCallback } from 'react';
import { supplierPriceService, ProductSupplierMapping } from '@/lib/services/supplierPriceService';
import { supplierService, Supplier } from '@/lib/services/suppliers/supplierService';
import SupplierPriceImportModal from '@/components/SupplierPriceImportModal';

interface UnmappedProduct {
  id: string;
  name: string;
  stock: number;
  pack_size: number;
}

export default function SupplierPricingClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [mappings, setMappings] = useState<ProductSupplierMapping[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ProductSupplierMapping | null>(null);

  const [newMapping, setNewMapping] = useState({
    product_id: '',
    supplier_id: '',
    cost_price: 0,
    minimum_order_qty: 1,
    lead_time_days: 7,
    is_preferred: false,
    pack_size: 1,
    case_quantity: 1,
    vat_rate: 0,
    supplier_sku: '',
  });

  const [packEditForm, setPackEditForm] = useState({
    product_id: '',
    pack_size: 1,
    pack_unit: '',
    reorder_frequency: 'regular',
  });

  const [showPackEdit, setShowPackEdit] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [mappingsData, suppliersData, unmappedData] = await Promise.all([
      supplierPriceService.getAllMappings(),
      supplierService.getAllSuppliers(false),
      supplierPriceService.getUnmappedProducts(),
    ]);
    setMappings(mappingsData);
    setSuppliers(suppliersData);
    setUnmapped(unmappedData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredMappings = mappings.filter(m =>
    m.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await supplierPriceService.upsertMapping({
      product_id: newMapping.product_id,
      supplier_id: newMapping.supplier_id,
      cost_price: newMapping.cost_price,
      minimum_order_qty: newMapping.minimum_order_qty,
      lead_time_days: newMapping.lead_time_days,
      is_preferred: newMapping.is_preferred,
      pack_size: newMapping.pack_size,
      case_quantity: newMapping.case_quantity,
      vat_rate: newMapping.vat_rate,
      supplier_sku: newMapping.supplier_sku,
    });
    if (success) {
      setShowAddModal(false);
      setNewMapping({
        product_id: '',
        supplier_id: '',
        cost_price: 0,
        minimum_order_qty: 1,
        lead_time_days: 7,
        is_preferred: false,
        pack_size: 1,
        case_quantity: 1,
        vat_rate: 0,
        supplier_sku: '',
      });
      loadAll();
    }
  };

  const handleEditMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapping) return;
    const success = await supplierPriceService.upsertMapping({
      product_id: editingMapping.product_id,
      supplier_id: editingMapping.supplier_id,
      cost_price: editingMapping.cost_price,
      minimum_order_qty: editingMapping.minimum_order_qty,
      lead_time_days: editingMapping.lead_time_days,
      is_preferred: editingMapping.is_preferred,
    });
    if (success) {
      setEditingMapping(null);
      loadAll();
    }
  };

  const handleDeleteMapping = async (id: string) => {
    if (!confirm('Remove this supplier-product mapping?')) return;
    await supplierPriceService.deleteMapping(id);
    loadAll();
  };

  const handleSavePackInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await supplierPriceService.updateProductPackInfo(
      packEditForm.product_id,
      packEditForm.pack_size,
      packEditForm.pack_unit || null,
      packEditForm.reorder_frequency,
    );
    if (success) {
      setShowPackEdit(false);
      loadAll();
    }
  };

  const openPackEdit = (mapping: ProductSupplierMapping) => {
    setPackEditForm({
      product_id: mapping.product_id,
      pack_size: mapping.pack_size,
      pack_unit: mapping.pack_unit || '',
      reorder_frequency: mapping.reorder_frequency,
    });
    setShowPackEdit(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getFrequencyColor = (freq: string) => {
    switch (freq) {
      case 'fast-moving': return 'bg-red-500/20 text-red-400';
      case 'slow-moving': return 'bg-slate-500/20 text-slate-400';
      default: return 'bg-blue-500/20 text-blue-400';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Supplier Pricing</h1>
          <p className="text-slate-400">
            Assign products to suppliers, set pack sizes, and manage pricing per supplier
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Import Price List
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            + Add Supplier Pricing
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by product or supplier name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Loading supplier pricing...</p>
        </div>
      ) : (
        <>
          {/* Unmapped products warning */}
          {unmapped.length > 0 && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm text-amber-400">
                {unmapped.length} product{unmapped.length !== 1 ? 's' : ''} not yet assigned to any supplier.
                These will not appear in backorder plans until you assign them.
              </p>
            </div>
          )}

          {/* Mappings table */}
          {filteredMappings.length > 0 ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700 bg-slate-900/50">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Supplier</th>
                    <th className="px-3 py-3 font-medium">Purchase Days</th>
                    <th className="px-3 py-3 font-medium text-center">Stock</th>
                    <th className="px-3 py-3 font-medium text-center">Pack Size</th>
                    <th className="px-3 py-3 font-medium text-center">Frequency</th>
                    <th className="px-3 py-3 font-medium text-right">Cost/Pack</th>
                    <th className="px-3 py-3 font-medium text-center">MOQ</th>
                    <th className="px-3 py-3 font-medium text-center">Lead (days)</th>
                    <th className="px-3 py-3 font-medium text-center">Preferred</th>
                    <th className="px-3 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map((m) => (
                    <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{m.product_name}</td>
                      <td className="px-3 py-3 text-slate-300">{m.supplier_name}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.purchase_days && m.purchase_days.length > 0 ? (
                            m.purchase_days.map(day => (
                              <span key={day} className="px-1.5 py-0.5 bg-slate-700 rounded text-[9px] font-bold text-cyan-400 uppercase">
                                {day.substring(0, 3)}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-600 text-[10px] italic">Not set</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-300">{m.product_stock}</td>
                      <td className="px-3 py-3 text-center text-slate-300">
                        {m.pack_size}{m.pack_unit ? ` / ${m.pack_unit}` : ''}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${getFrequencyColor(m.reorder_frequency)}`}>
                          {m.reorder_frequency}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-white font-semibold">{formatCurrency(m.cost_price)}</td>
                      <td className="px-3 py-3 text-center text-slate-300">{m.minimum_order_qty}</td>
                      <td className="px-3 py-3 text-center text-slate-300">{m.lead_time_days}</td>
                      <td className="px-3 py-3 text-center">
                        {m.is_preferred ? (
                          <span className="text-cyan-400 font-bold">Yes</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingMapping(m)}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                            title="Edit pricing"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openPackEdit(m)}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                            title="Edit pack info"
                          >
                            Pack
                          </button>
                          <button
                            onClick={() => handleDeleteMapping(m.id)}
                            className="px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 flex flex-col items-center justify-center text-center">
              <span className="text-5xl mb-4">🏭</span>
              <h2 className="text-lg font-bold text-slate-200 mb-2">No Supplier Pricing Found</h2>
              <p className="text-sm text-slate-500 max-w-md">
                Assign products to suppliers with pricing so the backorder planning system can calculate purchase costs.
              </p>
            </div>
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Add Supplier Pricing</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddMapping} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Product *</label>
                <select
                  required
                  value={newMapping.product_id}
                  onChange={(e) => setNewMapping({ ...newMapping, product_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select a product...</option>
                  {unmapped.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  {mappings.filter(m => !unmapped.find(u => u.id === m.product_id)).map((m) => (
                    <option key={m.product_id} value={m.product_id}>{m.product_name} (already mapped)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Supplier *</label>
                <select
                  required
                  value={newMapping.supplier_id}
                  onChange={(e) => setNewMapping({ ...newMapping, supplier_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Cost per Pack *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newMapping.cost_price}
                    onChange={(e) => setNewMapping({ ...newMapping, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Supplier SKU</label>
                  <input
                    type="text"
                    value={newMapping.supplier_sku}
                    onChange={(e) => setNewMapping({ ...newMapping, supplier_sku: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Supplier's ID for product"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Pack Size</label>
                  <input
                    type="number"
                    value={newMapping.pack_size}
                    onChange={(e) => setNewMapping({ ...newMapping, pack_size: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Case Qty</label>
                  <input
                    type="number"
                    value={newMapping.case_quantity}
                    onChange={(e) => setNewMapping({ ...newMapping, case_quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">VAT %</label>
                  <input
                    type="number"
                    value={newMapping.vat_rate}
                    onChange={(e) => setNewMapping({ ...newMapping, vat_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Min Order Qty</label>
                  <input
                    type="number"
                    value={newMapping.minimum_order_qty}
                    onChange={(e) => setNewMapping({ ...newMapping, minimum_order_qty: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Lead Time (days)</label>
                  <input
                    type="number"
                    value={newMapping.lead_time_days}
                    onChange={(e) => setNewMapping({ ...newMapping, lead_time_days: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newMapping.is_preferred}
                    onChange={(e) => setNewMapping({ ...newMapping, is_preferred: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Preferred Supplier
                </label>
              </div>
              <button type="submit" className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors">
                Save Mapping
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingMapping && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Edit Pricing</h2>
              <button onClick={() => setEditingMapping(null)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditMapping} className="space-y-4">
              <div className="text-sm text-slate-400">
                <p>Product: <span className="text-white font-medium">{editingMapping.product_name}</span></p>
                <p>Supplier: <span className="text-white font-medium">{editingMapping.supplier_name}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Cost per Pack *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingMapping.cost_price}
                    onChange={(e) => setEditingMapping({ ...editingMapping, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Supplier SKU</label>
                  <input
                    type="text"
                    value={editingMapping.supplier_sku || ''}
                    onChange={(e) => setEditingMapping({ ...editingMapping, supplier_sku: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Pack Size</label>
                  <input
                    type="number"
                    value={editingMapping.pack_size}
                    onChange={(e) => setEditingMapping({ ...editingMapping, pack_size: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Case Qty</label>
                  <input
                    type="number"
                    value={editingMapping.case_quantity}
                    onChange={(e) => setEditingMapping({ ...editingMapping, case_quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">VAT %</label>
                  <input
                    type="number"
                    value={editingMapping.vat_rate}
                    onChange={(e) => setEditingMapping({ ...editingMapping, vat_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Min Order Qty</label>
                  <input
                    type="number"
                    value={editingMapping.minimum_order_qty}
                    onChange={(e) => setEditingMapping({ ...editingMapping, minimum_order_qty: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Lead Time (days)</label>
                  <input
                    type="number"
                    value={editingMapping.lead_time_days}
                    onChange={(e) => setEditingMapping({ ...editingMapping, lead_time_days: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingMapping.is_preferred}
                    onChange={(e) => setEditingMapping({ ...editingMapping, is_preferred: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Preferred Supplier
                </label>
              </div>
              <button type="submit" className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors">
                Update Pricing
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pack Edit Modal */}
      {showPackEdit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Edit Pack Info</h2>
              <button onClick={() => setShowPackEdit(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSavePackInfo} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Pack Size (units per pack) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={packEditForm.pack_size}
                    onChange={(e) => setPackEditForm({ ...packEditForm, pack_size: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">E.g. 6 or 12 units per box</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Pack Unit Label</label>
                  <input
                    type="text"
                    placeholder="box, carton, case..."
                    value={packEditForm.pack_unit}
                    onChange={(e) => setPackEditForm({ ...packEditForm, pack_unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Reorder Frequency</label>
                  <select
                    value={packEditForm.reorder_frequency}
                    onChange={(e) => setPackEditForm({ ...packEditForm, reorder_frequency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="regular">Regular</option>
                    <option value="fast-moving">Fast-moving</option>
                    <option value="slow-moving">Slow-moving</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">Fast-moving triggers POs even when stock covers current orders</p>
                </div>
              </div>
              <button type="submit" className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors">
                Save Pack Info
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Price List Import Modal */}
      <SupplierPriceImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onComplete={loadAll}
        suppliers={suppliers}
      />
    </div>
  );
}
