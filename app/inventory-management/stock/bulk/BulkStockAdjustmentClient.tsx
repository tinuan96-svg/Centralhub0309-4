'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService, MovementType } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface BulkAdjustmentItem {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  current_stock: number;
  new_count: string; // Using string to handle empty input
}

interface BulkResult {
  updated_skus: string[];
  skipped_skus: string[];
  errors: { sku: string; reason: string }[];
  requested_count: number;
  processed_count: number;
  batch_id: string;
}

export default function BulkStockAdjustmentClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [products, setProducts] = useState<BulkAdjustmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [reason, setReason] = useState('Bulk Physical Count');
  const [adjustmentType, setAdjustmentType] = useState<MovementType>('MANUAL_ADJUSTMENT');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select('id, name, sku, stock, image_url')
        .order('name');

      if (prodError) throw prodError;

      const { data: invData } = await supabase
        .from('central_inventory')
        .select('product_id, stock_quantity');

      const invMap = new Map((invData || []).map(row => [row.product_id, row.stock_quantity]));

      const mapped = (prodData || []).map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        image_url: p.image_url,
        current_stock: invMap.has(p.id) ? Number(invMap.get(p.id)) : Number(p.stock || 0),
        new_count: '',
      }));

      setProducts(mapped);
    } catch (err: any) {
      console.error('Error loading products:', err);
      setMessage({ type: 'error', text: 'Failed to load products' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleUpdateCount = (id: string, value: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, new_count: value } : p));
  };

  const stats = useMemo(() => {
    const entered = products.filter(p => p.new_count.trim() !== '');
    const valid = entered.filter(p => p.sku && !isNaN(parseInt(p.new_count)) && parseInt(p.new_count) >= 0);
    const invalid = entered.filter(p => !p.sku || isNaN(parseInt(p.new_count)) || parseInt(p.new_count) < 0);

    return {
      totalEntered: entered.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      validItems: valid
    };
  }, [products]);

  const handleSaveAll = async () => {
    if (stats.validCount === 0) {
      setMessage({ type: 'error', text: 'No valid changes entered' });
      return;
    }

    if (stats.invalidCount > 0) {
      setMessage({ type: 'error', text: `Please fix ${stats.invalidCount} invalid entries before saving.` });
      return;
    }

    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for the adjustment' });
      return;
    }

    setSaving(true);
    setMessage(null);
    setBulkResult(null);

    try {
      const payload = stats.validItems.map(item => ({
        sku: item.sku!,
        count: parseInt(item.new_count)
      }));

      const result = await InventoryManagementService.bulkAdjustStock({
        items: payload,
        reason: reason.trim(),
        type: adjustmentType
      });

      setBulkResult(result);

      if (result.errors.length === 0) {
        setMessage({ type: 'success', text: `Successfully updated ${result.processed_count} products (Batch: ${result.batch_id.substring(0, 8)})` });
      } else {
        setMessage({ type: 'error', text: `Processed ${result.processed_count} items, but ${result.errors.length} errors occurred.` });
      }

      // Refresh data to reflect new stock levels
      loadProducts();
    } catch (err: any) {
      console.error('Bulk update failed:', err);
      setMessage({ type: 'error', text: `Bulk update failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-tight">Bulk Stock Entry</h1>
          <p className="text-slate-400">Transactional bulk update using SKU mapping</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadProducts}
            disabled={loading || saving}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors border border-slate-700 font-medium"
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <Link
            href="/inventory-management/stock"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors border border-slate-700 font-medium"
          >
            Back to List
          </Link>
          <button
            onClick={handleSaveAll}
            disabled={saving || stats.validCount === 0 || stats.invalidCount > 0}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20"
          >
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : message.type === 'info' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
          <p className="font-bold flex items-center gap-2">
            {message.type === 'success' ? '✅' : message.type === 'info' ? 'ℹ️' : '⚠️'} {message.text}
          </p>
        </div>
      )}

      {bulkResult && bulkResult.errors.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
          <h3 className="text-rose-400 font-bold mb-2">Failed SKUs:</h3>
          <ul className="text-sm text-rose-300 space-y-1">
            {bulkResult.errors.map((err, i) => (
              <li key={i}><strong>{err.sku}</strong>: {err.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 fold-inner:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="fold-inner:col-span-1 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl fold-inner:sticky fold-inner:top-8">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Adjustment Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Adjustment Type</label>
                <select
                  value={adjustmentType}
                  onChange={e => setAdjustmentType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="MANUAL_ADJUSTMENT">Manual Stocktake</option>
                  <option value="PURCHASE">Initial Stock Entry</option>
                  <option value="RETURN">Customer Return</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Internal Notes</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-24"
                  placeholder="Why is this stock being updated?"
                />
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Pre-Submit Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Items to update:</span>
                    <span className="text-xs font-bold text-white">{stats.totalEntered}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Valid rows:</span>
                    <span className="text-xs font-bold text-emerald-400">{stats.validCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Invalid rows:</span>
                    <span className={`text-xs font-bold ${stats.invalidCount > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{stats.invalidCount}</span>
                  </div>
                </div>
                {stats.invalidCount > 0 && (
                  <p className="mt-3 text-[9px] text-rose-400/80 italic leading-tight">
                    * All items must have a SKU and a non-negative number to be processed.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Entry Table */}
        <div className="fold-inner:col-span-2 space-y-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="relative">
              <input
                type="text"
                placeholder="Quick Filter by Product or SKU..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">🔍</span>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 border-b border-slate-700/50">
                  <tr>
                    <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Product</th>
                    <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Current Stock</th>
                    <th className="px-4 py-4 text-center font-bold text-slate-100 uppercase tracking-widest text-[9px] bg-slate-700/30">New Total (Manual Count)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-slate-500">Loading catalog...</td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-slate-500">No products found matching your search.</td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => (
                      <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/30">
                              <ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-200 line-clamp-1">{p.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono uppercase">{p.sku || '—'}</p>
                              {!p.sku && <p className="text-[9px] text-rose-400 font-bold uppercase mt-0.5">Missing SKU - Blocked</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-slate-400 font-mono">{p.current_stock}</span>
                        </td>
                        <td className="px-4 py-4 text-center bg-slate-700/10">
                          <input
                            type="number"
                            value={p.new_count}
                            onChange={e => handleUpdateCount(p.id, e.target.value)}
                            placeholder="Type count..."
                            disabled={!p.sku}
                            className={`w-32 px-3 py-1.5 bg-slate-800 border rounded-lg text-center font-mono font-bold transition-all focus:outline-none focus:ring-2 ${p.new_count !== '' ? (parseInt(p.new_count) >= 0 ? 'border-cyan-500 text-cyan-400 ring-2 ring-cyan-500/20' : 'border-rose-500 text-rose-400 ring-2 ring-rose-500/20') : 'border-slate-700 text-slate-400'}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
