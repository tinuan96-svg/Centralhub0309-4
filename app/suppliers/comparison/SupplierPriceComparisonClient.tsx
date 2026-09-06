'use client';

import { useEffect, useState, useCallback } from 'react';
import { supplierPriceService } from '@/lib/services/supplierPriceService';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';

export default function SupplierPriceComparisonClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterActiveOnly, setFilterActiveOnly] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const comparisonData = await supplierPriceService.getComparisonData();
    setData(comparisonData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredData = data.filter(product => {
    // Search by product name or SKU
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()));

    // Filter by supplier if selected
    const matchesSupplier = filterSupplier === 'all' ||
                            product.suppliers.some((s: any) => s.supplier_id === filterSupplier);

    // Only show products that have at least one supplier mapping
    const hasSuppliers = product.suppliers.length > 0;

    return matchesSearch && matchesSupplier && hasSuppliers;
  });

  const allSuppliers = Array.from(new Set(data.flatMap(p => p.suppliers.map((s: any) => ({ id: s.supplier_id, name: s.supplier_name })))));
  const uniqueSuppliers = Array.from(new Map(allSuppliers.map((s: any) => [s.id, s])).values());

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Analyzing supplier price benchmarks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Supplier Price Comparison</h1>
          <p className="text-slate-400">Compare effective unit costs across multiple suppliers to find the best deal.</p>
        </div>
        <div className="flex gap-2">
           <button onClick={loadData} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all border border-slate-700">Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/50 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Search products or SKU..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500/50 outline-none"
          />
        </div>
        <select
          value={filterSupplier}
          onChange={e => setFilterSupplier(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <option value="all">All Suppliers</option>
          {uniqueSuppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex items-center gap-2 px-2">
           <input
             type="checkbox"
             checked={filterActiveOnly}
             onChange={e => setFilterActiveOnly(e.target.checked)}
             className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500"
           />
           <label className="text-sm text-slate-300">Show only active supplier links</label>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="space-y-4">
        {filteredData.length === 0 ? (
          <div className="bg-slate-800 rounded-2xl p-12 text-center border border-slate-700">
             <span className="text-5xl mb-4 block">⚖️</span>
             <h2 className="text-lg font-bold text-slate-200">No comparisons found</h2>
             <p className="text-sm text-slate-500">Assign products to multiple suppliers to see comparisons here.</p>
          </div>
        ) : filteredData.map(product => (
          <div key={product.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-lg transition-all hover:border-slate-700">
            <div className="px-6 py-4 bg-slate-800/30 border-b border-slate-800 flex justify-between items-center">
               <div>
                  <h3 className="text-lg font-bold text-white">{product.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 uppercase">Internal SKU: {product.sku || '—'}</p>
               </div>
               {product.cheapest_supplier && (
                 <div className="text-right">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Cheapest Supplier</p>
                    <p className="text-sm font-bold text-white">{product.cheapest_supplier.supplier_name}</p>
                 </div>
               )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-slate-500 uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-3">Supplier / Item Info</th>
                    <th className="px-4 py-3 text-center">Pack/Case</th>
                    <th className="px-4 py-3 text-right">Supplier Price</th>
                    <th className="px-4 py-3 text-right">Effective Unit Cost</th>
                    <th className="px-4 py-3 text-center">Comparison</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {product.suppliers.map((s: any) => {
                    const isCheapest = s.id === product.cheapest_supplier?.id;
                    const diff = s.effective_unit_cost - (product.cheapest_supplier?.effective_unit_cost || 0);
                    const diffPercent = product.cheapest_supplier?.effective_unit_cost > 0
                      ? (diff / product.cheapest_supplier.effective_unit_cost) * 100
                      : 0;

                    return (
                      <tr key={s.id} className={`hover:bg-slate-800/30 transition-colors ${isCheapest ? 'bg-emerald-500/5' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-200">{s.supplier_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Code: {s.supplier_sku || '—'} | Name: {s.supplier_product_name || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center text-slate-300 font-mono text-xs">
                          {s.pack_size} × {s.case_quantity}
                          <p className="text-[10px] text-slate-500 mt-1 uppercase">{(s.pack_size * s.case_quantity)} Units total</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                           <p className="font-bold text-slate-200">{formatCurrency(s.cost_price)}</p>
                           <p className="text-[10px] text-slate-500 mt-0.5">VAT: {s.vat_rate}%</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                           <p className={`font-black text-base ${isCheapest ? 'text-emerald-400' : 'text-slate-300'}`}>
                             {formatCurrency(s.effective_unit_cost)}
                           </p>
                           <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">Per single unit</p>
                        </td>
                        <td className="px-4 py-4 text-center">
                           {isCheapest ? (
                             <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase rounded shadow-lg shadow-emerald-900/30">Lowest Cost</span>
                           ) : (
                             <div>
                                <p className="text-rose-400 font-bold text-xs">+{formatCurrency(diff)}</p>
                                <p className="text-[10px] text-rose-500/70 font-bold">({diffPercent.toFixed(1)}% more)</p>
                             </div>
                           )}
                        </td>
                        <td className="px-4 py-4 text-center">
                           <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                             s.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                           }`}>
                             {s.is_active ? 'Active' : 'Inactive'}
                           </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
