'use client';

import { useState, useEffect, useCallback } from 'react';
import { PackingMaterial, PackingMaterialService } from '@/lib/services/packingMaterialService';
import { designTokens } from '@/lib/design-system';
import { formatCurrency } from '@/lib/utils/currency';
import SkeletonLoader from '@/components/SkeletonLoader';

type Tab = 'inventory' | 'transactions' | 'orders';

export default function PackagingManagementClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [materials, setMaterials] = useState<PackingMaterial[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t, p, pred] = await Promise.all([
        PackingMaterialService.getAllMaterials(),
        PackingMaterialService.getTransactions(),
        PackingMaterialService.getPurchaseOrders(),
        PackingMaterialService.getUsagePredictions()
      ]);
      setMaterials(m);
      setTransactions(t);
      setPOs(p);
      setPredictions(pred);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'box': return '📦';
      case 'filler': return '☁️';
      case 'tape': return '🩹';
      case 'label': return '🏷️';
      default: return '🛠️';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Packaging Materials</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Manage boxes, filler, and labels</p>
        </div>
        <div className="flex gap-2">
           <button
             onClick={() => setShowAddModal(true)}
             className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-900/20 transition-all active:scale-95"
           >
             + Add Material
           </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-2xl border border-slate-800/50 w-fit">
        {[
          { id: 'inventory', label: 'Inventory', icon: '📋' },
          { id: 'transactions', label: 'Activity', icon: '🔄' },
          { id: 'orders', label: 'Material POs', icon: '📝' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonLoader variant="list" count={5} />
      ) : (
        <div className="space-y-6">
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {materials.map((m) => {
                const isLow = m.current_stock <= m.minimum_stock_alert;
                const prediction = predictions[m.id];
                const daysRemaining = prediction?.daysRemaining;

                return (
                  <div key={m.id} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                          {getCategoryIcon(m.category)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-100">{m.name}</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{m.category} • {m.size || 'Standard'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isLow && (
                          <span className="px-2 py-0.5 bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-[9px] font-black uppercase animate-pulse">Low Stock</span>
                        )}
                        {daysRemaining !== undefined && daysRemaining < 14 && (
                           <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                             daysRemaining <= 3 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                           }`}>
                             Runs out in ~{daysRemaining} days
                           </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-slate-800/30 p-2 rounded-lg">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">Stock Level</p>
                          <p className={`text-lg font-black ${isLow ? 'text-rose-400' : 'text-cyan-400'}`}>
                            {m.current_stock} <span className="text-[10px] font-bold text-slate-500">{m.unit}</span>
                          </p>
                       </div>
                       <div className="bg-slate-800/30 p-2 rounded-lg">
                          <p className="text-[9px] text-slate-500 font-bold uppercase">Unit Cost</p>
                          <p className="text-lg font-black text-emerald-400">{formatCurrency(m.purchase_cost_per_unit)}</p>
                       </div>
                    </div>

                    {m.category === 'box' && m.internal_length && (
                      <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 mb-4 border-t border-slate-800 pt-3">
                         <span>📏 {m.internal_length}x{m.internal_width}x{m.internal_height} cm</span>
                         <span>•</span>
                         <span>🧊 {m.volume_cm3 ? (m.volume_cm3 / 1000).toFixed(1) : 0}L</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                       <button className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-black uppercase transition-all">Edit</button>
                       <button className="flex-1 py-2 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 rounded-lg text-[10px] font-black uppercase transition-all">Order More</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                    <tr>
                      <th className="px-6 py-4 text-left">Date</th>
                      <th className="px-6 py-4 text-left">Material</th>
                      <th className="px-6 py-4 text-left">Type</th>
                      <th className="px-6 py-4 text-right">Quantity</th>
                      <th className="px-6 py-4 text-left">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30 transition-all">
                        <td className="px-6 py-4 text-slate-300 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 font-bold text-slate-100">{t.packing_materials?.name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            t.type === 'IN' ? 'bg-emerald-500/20 text-emerald-400' :
                            t.type === 'OUT' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {t.type}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-black ${t.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.quantity > 0 ? '+' : ''}{t.quantity}
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-xs">
                          {t.reference_type?.toUpperCase()} {t.reference_id?.substring(0, 8)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-4">
              {pos.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No Material Purchase Orders</p>
                </div>
              ) : (
                pos.map(po => (
                  <div key={po.id} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="font-mono text-xs text-blue-400 font-bold mb-1">{po.po_number}</p>
                      <h3 className="font-black text-white">{po.supplier_name}</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Total: {formatCurrency(po.total_cost)}</p>
                    </div>
                    <div className="text-right">
                       <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                         po.status === 'received' ? 'bg-emerald-500 text-white' :
                         po.status === 'ordered' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                       }`}>
                         {po.status}
                       </span>
                       <p className="text-[10px] text-slate-500 mt-2">{new Date(po.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
