'use client';

import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { CATEGORY_HIERARCHY } from '@/lib/constants/categories';

interface ProductWithDetails {
  id: string;
  name: string;
  department: string;
  category: string;
  subcategory: string;
  [key: string]: any;
}

interface BulkCategorizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithDetails[];
  onApplied: () => void;
}

export default function BulkCategorizeModal({ isOpen, onClose, products, onApplied }: BulkCategorizeModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetDepartment, setTargetDepartment] = useState<string>('');
  const [targetCategory, setTargetCategory] = useState<string>('');
  const [targetSubcategory, setTargetSubcategory] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.subcategory || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const availableCategories = useMemo(() => {
    if (!targetDepartment) return [];
    return CATEGORY_HIERARCHY.find(d => d.name === targetDepartment)?.categories || [];
  }, [targetDepartment]);

  const availableSubcategories = useMemo(() => {
    if (!targetCategory) return [];
    return availableCategories.find(c => c.name === targetCategory)?.subcategories || [];
  }, [availableCategories, targetCategory]);

  const toggleProduct = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  }, [filteredProducts]);

  const selectAllUncategorized = useCallback(() => {
    setSelectedIds(new Set(products.filter(p => !p.subcategory || p.subcategory === 'N/A').map(p => p.id)));
  }, [products]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleApply = async () => {
    if (selectedIds.size === 0) return;
    setApplying(true);
    setResult(null);

    const updateData: any = {};
    if (targetDepartment) updateData.department = targetDepartment;
    if (targetCategory) updateData.category = targetCategory;
    if (targetSubcategory) updateData.subcategory = targetSubcategory;

    if (Object.keys(updateData).length === 0) {
      setApplying(false);
      return;
    }

    try {
      const ids = Array.from(selectedIds);
      let updated = 0;
      let failed = 0;

      const BATCH_SIZE = 50;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('products')
          .update(updateData)
          .in('id', batch);

        if (error) {
          console.error('Bulk categorize error:', error);
          failed += batch.length;
        } else {
          updated += batch.length;
        }
      }

      setResult({ updated, failed });
      if (updated > 0) {
        onApplied();
      }
    } catch (err) {
      console.error('Bulk categorize exception:', err);
      setResult({ updated: 0, failed: selectedIds.size });
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    setSearch('');
    setSelectedIds(new Set());
    setTargetDepartment('');
    setTargetCategory('');
    setTargetSubcategory('');
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-slate-100">Bulk Categorize Products</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {result ? (
          /* Result view */
          <div className="p-8 flex flex-col items-center justify-center flex-1">
            <div className="text-5xl mb-4">{result.failed === 0 ? '✓' : '⚠'}</div>
            <p className="text-lg font-medium text-slate-200 mb-2">
              {result.updated} product{result.updated !== 1 ? 's' : ''} updated successfully
            </p>
            {result.failed > 0 && (
              <p className="text-sm text-rose-400 mb-4">
                {result.failed} product{result.failed !== 1 ? 's' : ''} failed to update
              </p>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Product selection area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 pt-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <span className="text-sm text-slate-400 whitespace-nowrap">
                    {selectedIds.size} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                  >
                    Select All Filtered
                  </button>
                  <button
                    type="button"
                    onClick={selectAllUncategorized}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg transition-colors"
                  >
                    Select Uncategorized
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-2">
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No products match your search</p>
                ) : (
                  <div className="space-y-1">
                    {filteredProducts.slice(0, 200).map(p => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="w-4 h-4 accent-cyan-500"
                        />
                        <span className="text-sm text-slate-200 flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {p.department !== 'N/A' ? p.department : '—'} / {p.category !== 'N/A' ? p.category : '—'} / {p.subcategory !== 'N/A' ? p.subcategory : '—'}
                        </span>
                      </label>
                    ))}
                    {filteredProducts.length > 200 && (
                      <p className="text-center text-xs text-slate-500 py-2">
                        Showing first 200 of {filteredProducts.length} products. Use search to narrow down.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Assignment controls */}
            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Department</label>
                  <select
                    value={targetDepartment}
                    onChange={e => { setTargetDepartment(e.target.value); setTargetCategory(''); setTargetSubcategory(''); }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="">No change</option>
                    {CATEGORY_HIERARCHY.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Category</label>
                  <select
                    value={targetCategory}
                    onChange={e => { setTargetCategory(e.target.value); setTargetSubcategory(''); }}
                    disabled={!targetDepartment}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
                  >
                    <option value="">No change</option>
                    {availableCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">Subcategory</label>
                  <select
                    value={targetSubcategory}
                    onChange={e => setTargetSubcategory(e.target.value)}
                    disabled={!targetCategory || availableSubcategories.length === 0}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
                  >
                    <option value="">No change</option>
                    {availableSubcategories.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {selectedIds.size === 0
                    ? 'Select products above to categorize'
                    : `Will apply to ${selectedIds.size} product${selectedIds.size !== 1 ? 's' : ''}`}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={selectedIds.size === 0 || applying || (!targetDepartment && !targetCategory && !targetSubcategory)}
                    className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {applying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Applying...
                      </>
                    ) : (
                      `Apply to ${selectedIds.size} Product${selectedIds.size !== 1 ? 's' : ''}`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
