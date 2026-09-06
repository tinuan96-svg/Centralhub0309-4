'use client';

import { useEffect, useState, useCallback } from 'react';
import { InventoryManagementService } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { supabase } from '@/lib/supabase';

export default function MovementsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const loadMetadata = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name');
    setWarehouses(data || []);
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await InventoryManagementService.getMovements({
        type: filterType === 'all' ? undefined : filterType,
        limit: 200
      });
      setMovements(data);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    loadMovements();
    loadMetadata();
  }, [loadMovements, loadMetadata]);

  const filteredMovements = movements.filter(m => {
    const name = m.products?.name || m.product_name || '';
    const sku = m.products?.sku || m.sku || '';
    if (searchProduct && !name.toLowerCase().includes(searchProduct.toLowerCase()) && !sku.toLowerCase().includes(searchProduct.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Ledger (Audit Trail)</h1>
          <p className="text-sm text-slate-500 mt-1">Permanent record of all inventory transactions and adjustments</p>
        </div>

        <div className="flex flex-wrap gap-2">
           <button onClick={loadMovements} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white border border-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
           </button>
           <button className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700">Export PDF</button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 shadow-lg">
        <div className="relative">
          <input
            type="text"
            placeholder="Filter by Product/SKU..."
            value={searchProduct}
            onChange={e => setSearchProduct(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 px-4 py-2 focus:outline-none"
        >
          <option value="all">All Transactions</option>
          <option value="ORDER">Order Stock Movements</option>
          <option value="ADJUSTMENT">Manual Adjustments</option>
          <option value="MANUAL">Manual Stock Changes</option>
        </select>

        <select
          value={filterWarehouse}
          onChange={e => setFilterWarehouse(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 px-4 py-2 focus:outline-none"
        >
          <option value="all">All Warehouses</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <div className="flex gap-2">
           <input type="date" className="flex-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-4 py-2 focus:outline-none" />
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 border-b border-slate-700/50">
              <tr>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Timestamp</th>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Product / Catalog</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Movement Type</th>
                <th className="px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[9px]">Prev</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Change</th>
                <th className="px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[9px]">New Bal</th>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Audit Note / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-24 text-center text-slate-400">
                  <div className="inline-flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    Loading ledger entries...
                  </div>
                </td></tr>
              )}
              {error && !loading && (
                <tr><td colSpan={7} className="px-4 py-24 text-center">
                  <p className="text-slate-400 mb-4">Unable to load ledger entries. There may be a connection issue.</p>
                  <button onClick={loadMovements} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-500 transition-all">Retry</button>
                </td></tr>
              )}
              {!loading && !error && filteredMovements.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p className="text-slate-200 text-xs font-mono">{new Date(m.created_at).toLocaleDateString('en-GB')}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString('en-GB')}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/30 group-hover:border-cyan-500/30 transition-all">
                        <ProductImage imageUrl={m.products?.image_url} size="thumb" alt={m.products?.name || 'Product'} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-200">{m.products?.name || m.product_name || 'Unknown Product'}</p>
                        <p className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">{m.products?.sku || m.sku || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                      (m.change_amount || 0) < 0
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {m.action_type || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-500 font-mono font-bold">{m.old_stock}</td>
                  <td className={`px-4 py-4 text-center font-black font-mono text-base ${
                    m.change_amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {m.change_amount > 0 ? '▲' : '▼'} {Math.abs(m.change_amount)}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-100 font-black font-mono text-base">{m.new_stock}</td>
                  <td className="px-4 py-4 max-w-xs">
                    <div className="space-y-1">
                       <p className="text-slate-300 text-xs font-medium leading-snug">{m.notes}</p>
                       <div className="flex flex-wrap gap-2 items-center mt-1">
                          {m.order_number && (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 text-[8px] font-black rounded uppercase border border-cyan-500/20">Order: {m.order_number}</span>
                          )}
                          <span className="text-[8px] text-slate-600 uppercase font-bold">User: SYSTEM</span>
                          <span className="text-[8px] text-slate-600 uppercase font-bold px-1.5 border-l border-slate-800">WH-MAIN</span>
                       </div>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !error && filteredMovements.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-24 text-center text-slate-600 italic flex flex-col items-center">
                  <span className="text-4xl mb-4 opacity-20">📂</span>
                  No ledger entries matching your current filters
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
