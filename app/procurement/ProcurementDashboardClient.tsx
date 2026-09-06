'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { backorderService, BackorderPlanSummary, BackorderPlanItem } from '@/lib/services/backorderService';
import { procurementService, ProcurementRecommendation } from '@/lib/services/procurementService';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import { formatCurrency } from '@/lib/utils/currency';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import Link from 'next/link';

type Tab = 'overview' | 'backorders' | 'recommendations' | 'purchase_batches' | 'po_drafts';

export default function ProcurementDashboardClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [backorders, setBackorders] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<ProcurementRecommendation[]>([]);
  const [poDrafts, setPoDrafts] = useState<any[]>([]);
  const [stats, setStats] = useState({
    activeBackorders: 0,
    totalBackorderUnits: 0,
    productsToPurchase: 0,
    estimatedSpend: 0,
    pendingDrafts: 0
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Backorders
      const boData = await backorderService.getAllBackorderItems();
      setBackorders(boData);

      // 2. Fetch Recommendations
      const recs = await procurementService.calculateProcurementPlan(selectedStoreId);
      setRecommendations(recs.items);

      // 3. Fetch PO Drafts
      const { data: drafts } = await supabase
        .from('po_drafts')
        .select('*, suppliers(name, purchase_days)')
        .order('created_at', { ascending: false });
      setPoDrafts(drafts || []);

      // 4. Calculate Stats
      const activeBO = boData.filter(b => b.status !== 'fulfilled');
      setStats({
        activeBackorders: activeBO.length,
        totalBackorderUnits: activeBO.reduce((sum, b) => sum + (b.quantity_ordered - b.quantity_fulfilled), 0),
        productsToPurchase: recs.items.filter(i => i.recommended_purchase > 0).length,
        estimatedSpend: recs.total_spend,
        pendingDrafts: (drafts || []).filter(d => d.status === 'draft').length
      });

    } catch (err: any) {
      console.error('Error loading procurement data:', err);
      setError('Failed to load procurement dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  const purchaseBatches = useMemo(() => {
     const batches: Record<string, { supplier: string, nextDay: string, items: number, spend: number }> = {};

     recommendations.filter(r => r.recommended_purchase > 0).forEach(r => {
        const sName = r.supplier_name;
        if (!batches[sName]) {
           batches[sName] = { supplier: sName, nextDay: 'Calculating...', items: 0, spend: 0 };
        }
        batches[sName].items += 1;
        batches[sName].spend += r.total_cost;
     });

     return Object.values(batches).sort((a, b) => b.spend - a.spend);
  }, [recommendations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Initializing Procurement Engine...</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-tight">Procurement Command Centre</h1>
          <p className="text-sm text-slate-500 mt-1 uppercase font-black tracking-widest">Supply Chain & Inventory Replenishment</p>
        </div>
        <div className="w-full md:w-64">
           <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-8">
        {(['overview', 'backorders', 'recommendations', 'purchase_batches', 'po_drafts'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${
              activeTab === tab ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.replace('_', ' ')}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 shadow-lg shadow-cyan-500/50" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6 animate-in fade-in duration-500">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
             <StatCard title="Active Backorders" value={stats.activeBackorders} subValue={`${stats.totalBackorderUnits} units`} color="rose" />
             <StatCard title="Purchase Required" value={stats.productsToPurchase} subValue="Distinct Products" color="amber" />
             <StatCard title="Estimated Spend" value={formatCurrency(stats.estimatedSpend)} subValue="Total Value" color="cyan" />
             <StatCard title="Pending Drafts" value={stats.pendingDrafts} subValue="Awaiting Review" color="blue" />
             <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl flex flex-col justify-center">
                <button onClick={loadData} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase transition-all">Refresh All</button>
             </div>
          </div>
        )}

        {activeTab === 'backorders' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                   <tr>
                      <th className="px-6 py-4">Order / Customer</th>
                      <th className="px-6 py-4">Product</th>
                      <th className="px-6 py-4 text-center">Ordered</th>
                      <th className="px-6 py-4 text-center">Fulfilled</th>
                      <th className="px-6 py-4 text-center">Outstanding</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Created</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                   {backorders.map(bo => (
                      <tr key={bo.id} className="hover:bg-slate-800/30 transition-colors">
                         <td className="px-6 py-4">
                            <div className="font-bold text-white">{bo.orders?.order_number}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{bo.orders?.customer_name}</div>
                         </td>
                         <td className="px-6 py-4">
                            <div className="font-bold text-slate-300">{bo.products?.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{bo.products?.sku}</div>
                         </td>
                         <td className="px-6 py-4 text-center text-slate-300">{bo.quantity_ordered}</td>
                         <td className="px-6 py-4 text-center text-emerald-400">{bo.quantity_fulfilled}</td>
                         <td className="px-6 py-4 text-center text-rose-400 font-bold">{bo.quantity_ordered - bo.quantity_fulfilled}</td>
                         <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                               bo.status === 'fulfilled' ? 'bg-emerald-500/10 text-emerald-400' :
                               bo.status === 'partial' ? 'bg-amber-500/10 text-amber-400' :
                               'bg-rose-500/10 text-rose-400'
                            }`}>{bo.status}</span>
                         </td>
                         <td className="px-6 py-4 text-right text-[10px] text-slate-500">
                            {new Date(bo.created_at).toLocaleDateString()}
                         </td>
                      </tr>
                   ))}
                   {backorders.length === 0 && (
                      <tr>
                         <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">No active backorders detected.</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
        )}

        {activeTab === 'recommendations' && (
           <div className="grid grid-cols-1 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                 <h2 className="text-lg font-bold text-white mb-4">Replenishment Recommendations</h2>
                 <p className="text-sm text-slate-400 mb-6">Based on current stock, customer demand, and 14-day sales forecasts.</p>

                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {recommendations.filter(r => r.recommended_purchase > 0).map(rec => (
                       <RecommendationCard key={rec.product_id} rec={rec} />
                    ))}
                 </div>
              </div>
           </div>
        )}

        {activeTab === 'purchase_batches' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {purchaseBatches.map(batch => (
                 <div key={batch.supplier} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl space-y-4">
                    <h3 className="font-bold text-white text-lg">{batch.supplier}</h3>
                    <div className="flex justify-between items-center">
                       <span className="text-xs text-slate-500 uppercase font-black">Next Purchase</span>
                       <span className="text-xs font-bold text-cyan-400 uppercase">{batch.nextDay}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-xs text-slate-500 uppercase font-black">Products</span>
                       <span className="text-xs font-bold text-slate-300">{batch.items} SKUs</span>
                    </div>
                    <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                       <span className="text-xs text-slate-500 uppercase font-black">Estimated Spend</span>
                       <span className="text-lg font-black text-white">{formatCurrency(batch.spend)}</span>
                    </div>
                    <Link
                       href={`/backorder-planning?supplier=${encodeURIComponent(batch.supplier)}`}
                       className="block w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-center rounded-xl text-[10px] font-black uppercase transition-all"
                    >
                       View Batch Details
                    </Link>
                 </div>
              ))}
           </div>
        )}

        {activeTab === 'po_drafts' && (
           <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                   <tr>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4">Supplier</th>
                      <th className="px-6 py-4">Items</th>
                      <th className="px-6 py-4 text-right">Total Amount</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                   {poDrafts.map(draft => (
                      <tr key={draft.id} className="hover:bg-slate-800/30 transition-colors">
                         <td className="px-6 py-4 text-slate-300 font-mono text-xs">{new Date(draft.created_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 text-white font-bold">{draft.suppliers?.name}</td>
                         <td className="px-6 py-4 text-slate-400">{(draft.draft_items || []).length} SKUs</td>
                         <td className="px-6 py-4 text-right font-bold text-cyan-400">{formatCurrency(draft.total_amount)}</td>
                         <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                               draft.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                               draft.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' :
                               'bg-amber-500/10 text-amber-400'
                            }`}>{draft.status}</span>
                         </td>
                         <td className="px-6 py-4 text-right">
                            <Link href={`/inventory-management/purchase-orders/${draft.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold uppercase tracking-wider">Review →</Link>
                         </td>
                      </tr>
                   ))}
                   {poDrafts.length === 0 && (
                      <tr>
                         <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No purchase order drafts found.</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, subValue, color }: { title: string, value: string | number, subValue: string, color: string }) {
   const colors: any = {
      rose: 'border-rose-500/20 text-rose-400 bg-rose-500/5',
      amber: 'border-amber-500/20 text-amber-400 bg-amber-500/5',
      cyan: 'border-cyan-500/20 text-cyan-400 bg-cyan-500/5',
      blue: 'border-blue-500/20 text-blue-400 bg-blue-500/5'
   };
   return (
      <div className={`p-6 rounded-3xl border ${colors[color]} flex flex-col justify-between h-32`}>
         <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
         <div>
            <p className="text-2xl font-black">{value}</p>
            <p className="text-[10px] opacity-60 font-bold uppercase tracking-tighter mt-1">{subValue}</p>
         </div>
      </div>
   );
}

function RecommendationCard({ rec }: { rec: ProcurementRecommendation }) {
   return (
      <div className="bg-slate-800/40 border border-slate-700 p-5 rounded-2xl hover:border-cyan-500/30 transition-all group">
         <div className="flex justify-between items-start mb-3">
            <div className="min-w-0">
               <h4 className="font-bold text-slate-100 truncate">{rec.product_name}</h4>
               <p className="text-[10px] text-slate-500 font-mono">{rec.sku}</p>
            </div>
            <div className="text-right">
               <span className="text-lg font-black text-cyan-400">{rec.recommended_purchase}</span>
               <p className="text-[8px] text-slate-600 uppercase font-black">Units</p>
            </div>
         </div>

         <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800">
               <p className="text-[8px] text-slate-600 uppercase font-black mb-0.5">Backorder</p>
               <p className="text-xs font-bold text-rose-400">{rec.backorder_debt}</p>
            </div>
            <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800">
               <p className="text-[8px] text-slate-600 uppercase font-black mb-0.5">Available</p>
               <p className="text-xs font-bold text-slate-300">{rec.available_stock}</p>
            </div>
         </div>

         <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
            <div className="flex flex-col">
               <span className="text-[8px] text-slate-600 uppercase font-black">Supplier</span>
               <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]">{rec.supplier_name}</span>
            </div>
            <div className="flex flex-col text-right">
               <span className="text-[8px] text-slate-600 uppercase font-black">Estimated Cost</span>
               <span className="text-xs font-black text-white">{formatCurrency(rec.total_cost)}</span>
            </div>
         </div>
      </div>
   );
}
