'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { backorderService, BackorderPlanSummary, SavedBackorderPlan, BackorderPlanItem } from '@/lib/services/backorderService';
import { supplierService, Supplier } from '@/lib/services/suppliers/supplierService';
import { useStore } from '@/lib/store/useStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';

type StatusFilter = 'all' | 'buy-now' | 'backordered' | 'stockout-risk' | 'replenish' | 'covered' | 'missing-supplier';
type SortField = 'priority' | 'name' | 'backorder' | 'recommended' | 'velocity' | 'lead-time';

function ProcurementRow({ item, isExpanded, onToggle, formatCurrency, getStatusBadge }: { item: BackorderPlanItem, isExpanded: boolean, onToggle: () => void, formatCurrency: (n: number) => string, getStatusBadge: (l?: string) => React.ReactNode }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-slate-700/20 transition-colors cursor-pointer group"
      >
        <td className="px-6 py-4">
          <div className="flex flex-col">
              <span className="text-white font-semibold group-hover:text-cyan-400 transition-colors">{item.product_name}</span>
              <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-500 font-mono">{item.sku}</span>
                  {getStatusBadge(item.status_label)}
              </div>
          </div>
        </td>
        <td className={`px-3 py-4 text-center font-mono font-bold ${item.current_stock < 0 ? 'text-rose-400' : item.current_stock <= (item.safety_stock || 0) ? 'text-amber-400' : 'text-slate-300'}`}>
          {item.current_stock}
        </td>
        <td className="px-3 py-4 text-center font-mono text-rose-400 font-bold">
          {item.backorder_debt || 0}
        </td>
        <td className="px-3 py-4 text-center font-mono text-emerald-400">
          {item.on_po_quantity || 0}
        </td>
        <td className="px-3 py-4 text-center font-mono text-slate-400">
          {(item.lead_time_demand || 0).toFixed(1)}
        </td>
        <td className="px-3 py-4 text-center">
          <div className="flex flex-col">
              <span className="text-slate-300 font-bold">{(item.daily_burn_rate || 0).toFixed(1)}</span>
              <span className="text-[9px] text-slate-500 uppercase font-black">/ Day</span>
          </div>
        </td>
        <td className="px-3 py-4 text-center">
          <div className="inline-flex flex-col items-center px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <span className="text-cyan-400 font-black text-lg leading-none">{item.units_needed}</span>
              <span className="text-[8px] text-cyan-600 uppercase font-black mt-1">Recommended</span>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex flex-col">
              <span className="text-white font-bold">{formatCurrency(item.total_cost)}</span>
              <span className="text-[9px] text-slate-500 uppercase font-black">{item.packs_to_order} Packs</span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-900/50">
          <td colSpan={8} className="px-6 py-4 border-l-2 border-cyan-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Calculation Evidence</h4>
                      <p className="text-xs text-slate-300 leading-relaxed italic">&quot;{item.reasoning}&quot;</p>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Demand Analysis</h4>
                      <div className="space-y-1">
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">Backorder Debt:</span> <span className="text-rose-400 font-bold">{item.backorder_debt}</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">LT Demand:</span> <span className="text-slate-300">{(item.lead_time_demand || 0).toFixed(1)}</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">Safety Stock:</span> <span className="text-slate-300">{(item.safety_stock || 0).toFixed(1)}</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">14d Coverage:</span> <span className="text-slate-300">{(item.forward_coverage_demand || 0).toFixed(1)}</span></div>
                      </div>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Supplier Logic</h4>
                      <div className="space-y-1">
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">Pack Size:</span> <span className="text-slate-300">{item.pack_size} units</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">Calculated Needed:</span> <span className="text-cyan-400 font-bold">{item.units_needed}</span></div>
                          <div className="flex justify-between text-[11px]"><span className="text-slate-500">Rounding Surplus:</span> <span className="text-amber-400">+{item.surplus_units}</span></div>
                      </div>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Triggered By Orders</h4>
                      <div className="flex flex-wrap gap-1">
                          {item.triggered_by_orders.length > 0 ? (
                              item.triggered_by_orders.map(o => (
                                  <span key={o} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[9px] font-mono border border-slate-700 rounded">{o}</span>
                              ))
                          ) : (
                              <span className="text-[10px] text-slate-600 italic">No direct customer orders (Replenishment)</span>
                          )}
                      </div>
                  </div>
              </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProcurementCard({ item, isExpanded, onToggle, formatCurrency, getStatusBadge }: { item: BackorderPlanItem, isExpanded: boolean, onToggle: () => void, formatCurrency: (n: number) => string, getStatusBadge: (l?: string) => React.ReactNode }) {
  return (
    <div className="p-4 bg-slate-900/20 active:bg-slate-800/40 transition-colors" onClick={onToggle}>
      <div className="flex justify-between items-start gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-slate-100 font-bold text-sm leading-tight truncate">{item.product_name}</h3>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.sku}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-cyan-400 font-black text-lg leading-none">{item.units_needed}</p>
          <p className="text-[8px] text-cyan-600 uppercase font-black mt-1">Recommended</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {getStatusBadge(item.status_label)}
        <div className="px-2 py-0.5 bg-slate-800 rounded text-[10px] font-bold text-slate-400">
           STOCK: <span className={item.current_stock <= (item.safety_stock || 0) ? 'text-amber-400' : 'text-slate-200'}>{item.current_stock}</span>
        </div>
        {(item.backorder_debt || 0) > 0 && (
          <div className="px-2 py-0.5 bg-rose-900/20 text-rose-400 rounded text-[10px] font-bold border border-rose-500/20">
            BO: {item.backorder_debt}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-500 uppercase font-black">Total Cost</span>
          <span className="text-white font-bold text-sm">{formatCurrency(item.total_cost)}</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[9px] text-slate-500 uppercase font-black">Pack Info</span>
          <span className="text-slate-300 font-medium text-xs">{item.packs_to_order} Packs (x{item.pack_size})</span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 p-4 bg-slate-950/50 rounded-xl border border-slate-800 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div>
            <h4 className="text-[9px] font-black text-slate-500 uppercase mb-1">Reasoning</h4>
            <p className="text-xs text-slate-300 italic">&quot;{item.reasoning}&quot;</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <h4 className="text-[9px] font-black text-slate-500 uppercase mb-2">Demand</h4>
                <div className="space-y-1 text-[10px]">
                   <div className="flex justify-between"><span className="text-slate-500">LT Demand:</span> <span className="text-slate-300">{(item.lead_time_demand || 0).toFixed(1)}</span></div>
                   <div className="flex justify-between"><span className="text-slate-500">Safety Stock:</span> <span className="text-slate-300">{(item.safety_stock || 0).toFixed(1)}</span></div>
                   <div className="flex justify-between"><span className="text-slate-500">On PO:</span> <span className="text-emerald-400">{item.on_po_quantity}</span></div>
                </div>
             </div>
             <div>
                <h4 className="text-[9px] font-black text-slate-500 uppercase mb-2">Orders</h4>
                <div className="flex flex-wrap gap-1">
                   {item.triggered_by_orders.slice(0, 4).map(o => (
                     <span key={o} className="px-1 py-0.5 bg-slate-800 text-slate-400 text-[8px] font-mono rounded">{o}</span>
                   ))}
                   {item.triggered_by_orders.length > 4 && <span className="text-[8px] text-slate-600">+{item.triggered_by_orders.length - 4} more</span>}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcurementPlanningPage({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [plan, setPlan] = useState<BackorderPlanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedBackorderPlan[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [generatingPO, setGeneratingPO] = useState<string | null>(null);
  const [poResults, setPoResults] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);

  // UI State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await backorderService.generatePlan(selectedStoreId);
      setPlan(result);
    } catch (err: any) {
      console.error('Error generating plan:', err);
      setError('Failed to generate procurement plan');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  const loadSavedPlans = useCallback(async () => {
    try {
      const data = await backorderService.getSavedPlans();
      setSavedPlans(data);
    } catch (err) {
      console.error('Error loading saved plans:', err);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await supplierService.getAllSuppliers(false);
      setSuppliers(data);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  }, []);

  useEffect(() => {
    loadPlan();
    loadSavedPlans();
    loadSuppliers();
  }, [loadPlan, loadSavedPlans, loadSuppliers]);

  const filteredAndSortedItems = useMemo(() => {
    if (!plan) return [];

    let items = [...plan.items];

    // Filter
    if (statusFilter !== 'all') {
      items = items.filter(item => {
        const label = item.status_label?.toLowerCase() || '';
        if (statusFilter === 'buy-now') return label.includes('buy now');
        if (statusFilter === 'backordered') return label.includes('backorder');
        if (statusFilter === 'stockout-risk') return label.includes('stockout');
        if (statusFilter === 'replenish') return label.includes('replenish');
        if (statusFilter === 'covered') return label.includes('covered');
        if (statusFilter === 'missing-supplier') return !item.supplier_id;
        return true;
      });
    }

    // Sort
    items.sort((a, b) => {
      if (sortField === 'priority') return (b.priority_score || 0) - (a.priority_score || 0);
      if (sortField === 'name') return a.product_name.localeCompare(b.product_name);
      if (sortField === 'backorder') return (b.backorder_debt || 0) - (a.backorder_debt || 0);
      if (sortField === 'recommended') return (b.units_needed || 0) - (a.units_needed || 0);
      if (sortField === 'velocity') return (b.daily_burn_rate || 0) - (a.daily_burn_rate || 0);
      if (sortField === 'lead-time') return (b.lead_time_demand || 0) - (a.lead_time_demand || 0);
      return 0;
    });

    return items;
  }, [plan, statusFilter, sortField]);

  const itemsBySupplier = useMemo(() => {
    const groups: Record<string, { supplier: any, items: BackorderPlanItem[], total: number }> = {};

    filteredAndSortedItems.forEach(item => {
      const sId = item.supplier_id || 'missing';
      if (!groups[sId]) {
        groups[sId] = {
          supplier: plan?.items_by_supplier.find(g => g.supplier.id === sId)?.supplier || { id: 'missing', name: 'No Preferred Supplier' },
          items: [],
          total: 0
        };
      }
      groups[sId].items.push(item);
      groups[sId].total += item.total_cost;
    });

    return Object.values(groups).sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
  }, [filteredAndSortedItems, plan]);

  const handleCreatePO = async (supplierId: string, supplierName: string, items: any[]) => {
    setGeneratingPO(supplierId);
    try {
      const storeId = selectedStoreId;
      const poId = await backorderService.createPODraft(supplierId, supplierName, items, storeId);

      if (poId) {
        setPoResults(prev => ({
          ...prev,
          [supplierId]: `PO draft created (ID: ${poId.slice(0, 8)})`
        }));
      } else {
        setPoResults(prev => ({
          ...prev,
          [supplierId]: 'Failed to create PO draft'
        }));
      }
    } catch (err) {
      console.error('handleCreatePO error:', err);
      setPoResults(prev => ({
        ...prev,
        [supplierId]: 'Error creating PO draft'
      }));
    } finally {
      setGeneratingPO(null);
    }
  };

  const handleSavePlan = async () => {
    if (!plan || plan.items.length === 0) return;
    setSavingPlan(true);
    try {
      const planId = await backorderService.savePlan(plan);
      if (planId) {
        setPoResults(prev => ({ ...prev, _save: `Plan saved (ID: ${planId.slice(0, 8)})` }));
        loadSavedPlans();
      } else {
        setPoResults(prev => ({ ...prev, _save: 'Failed to save plan' }));
      }
    } catch (err) {
      setPoResults(prev => ({ ...prev, _save: 'Error saving plan' }));
    } finally {
      setSavingPlan(false);
    }
  };

  const toggleExpand = (productId: string) => {
    setExpandedItems(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  const getStatusBadge = (label?: string) => {
    if (!label) return null;
    const l = label.toLowerCase();
    if (l.includes('backorder')) return <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase rounded border border-rose-500/30">🔴 Buy Now - Backorder</span>;
    if (l.includes('stockout')) return <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase rounded border border-amber-500/30">🟠 Buy Now - Stockout Risk</span>;
    if (l.includes('replenish')) return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase rounded border border-blue-500/30">🟡 Replenish Soon</span>;
    if (l.includes('covered')) return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-500/30">🟢 Covered by PO</span>;
    if (l.includes('missing')) return <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-500/30">⚪ Supplier Missing</span>;
    return <span className="px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] font-bold uppercase rounded">No Purchase Required</span>;
  };

  const isTodayAPurchaseDay = (days: string[] | undefined) => {
    if (!days || days.length === 0) return true;
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
    return days.includes(today);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Running Procurement Planning Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Store Filter */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-[10px] text-slate-500 uppercase font-black mb-1">Planning Scope</label>
          <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
        </div>
        <div className="flex gap-4">
            <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase font-black">Total Products</p>
                <p className="text-xl font-bold text-white">{plan?.total_products || 0}</p>
            </div>
            <div className="text-right border-l border-slate-700 pl-4">
                <p className="text-[10px] text-slate-500 uppercase font-black">Total Estimated Spend</p>
                <p className="text-xl font-bold text-cyan-400">{formatCurrency(plan?.total_estimated_spend || 0)}</p>
            </div>
        </div>
      </div>

      {/* Header & Controls */}
      <div className="sticky top-14 md:static z-20 bg-slate-950/80 backdrop-blur-md md:bg-transparent -mx-4 px-4 py-3 mb-6 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 border-b md:border-0 border-slate-800/50">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-white mb-1">Procurement Planning</h1>
          <p className="text-slate-400 text-[10px] sm:text-sm uppercase font-black tracking-widest">
            AI-Driven Replenishment
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
            <div className="flex-1 xs:flex-none flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden h-10">
                <span className="px-3 text-[10px] font-black text-slate-500 uppercase hidden xs:inline">Filter</span>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="bg-transparent text-slate-300 text-[10px] font-bold px-2 focus:outline-none h-full border-l border-slate-700 w-full xs:w-auto"
                >
                    <option value="all">All Items</option>
                    <option value="buy-now">🔴 Buy Now</option>
                    <option value="backordered">📦 Backordered</option>
                    <option value="stockout-risk">⚠️ Stockout Risk</option>
                    <option value="replenish">🕒 Replenish Soon</option>
                    <option value="covered">✅ Already on PO</option>
                    <option value="missing-supplier">⚪ No Supplier</option>
                </select>
            </div>

            <div className="flex-1 xs:flex-none flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden h-10">
                <span className="px-3 text-[10px] font-black text-slate-500 uppercase hidden xs:inline">Sort</span>
                <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="bg-transparent text-slate-300 text-[10px] font-bold px-2 focus:outline-none h-full border-l border-slate-700 w-full xs:w-auto"
                >
                    <option value="priority">🔥 Priority</option>
                    <option value="name">A-Z Name</option>
                    <option value="backorder">📉 Backorder</option>
                    <option value="recommended">🛒 Recommend</option>
                    <option value="velocity">⚡ Velocity</option>
                    <option value="lead-time">🚚 Lead Time</option>
                </select>
            </div>

            <button onClick={loadPlan} className="flex-1 xs:flex-none h-10 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-black uppercase transition-all">REFRESH</button>
            <button onClick={handleSavePlan} disabled={savingPlan || !plan?.items.length} className="hidden md:flex h-10 px-4 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase transition-all items-center justify-center">SAVE PLAN</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {itemsBySupplier.map((group, idx) => {
          const isPurchaseDay = isTodayAPurchaseDay(group.supplier.purchase_days);
          const sId = group.supplier.id;

          return (
            <div key={sId} className={`bg-slate-800 rounded-xl border overflow-hidden transition-all ${
              isPurchaseDay ? 'border-cyan-500/30' : 'border-slate-700 opacity-80'
            }`}>
              {/* Supplier Header */}
              <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/50 bg-slate-900/30">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-white">{group.supplier.name}</h2>
                        {isPurchaseDay ? (
                            <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black uppercase rounded animate-pulse">READY TODAY</span>
                        ) : (
                            <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-[10px] font-bold uppercase rounded">
                                NEXT: {group.supplier.purchase_days?.join(', ') || 'Not Set'}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase mt-1 font-bold">
                        {group.items.length} Products • {group.supplier.contact_email || 'No Email'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-black">Group Total</p>
                        <p className="text-xl font-bold text-white">{formatCurrency(group.total)}</p>
                    </div>
                    <button
                        onClick={() => handleCreatePO(sId, group.supplier.name, group.items)}
                        disabled={generatingPO === sId || sId === 'missing'}
                        className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase transition-all shadow-lg shadow-cyan-900/20"
                    >
                        {generatingPO === sId ? 'Creating...' : 'Generate PO'}
                    </button>
                </div>
              </div>

              {/* Table / Cards */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700/50 bg-slate-900/10">
                      <th className="px-6 py-3 text-[10px] font-black uppercase">Product</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">Available</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">Backorder</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">On PO</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">Lead Time</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">Forecast</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-center">Recommended</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {group.items.map((item) => (
                      <ProcurementRow
                        key={item.product_id}
                        item={item}
                        isExpanded={expandedItems[item.product_id]}
                        onToggle={() => toggleExpand(item.product_id)}
                        formatCurrency={formatCurrency}
                        getStatusBadge={getStatusBadge}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-700/30">
                {group.items.map((item) => (
                  <ProcurementCard
                    key={item.product_id}
                    item={item}
                    isExpanded={expandedItems[item.product_id]}
                    onToggle={() => toggleExpand(item.product_id)}
                    formatCurrency={formatCurrency}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {filteredAndSortedItems.length === 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 flex flex-col items-center justify-center text-center">
            <span className="text-5xl mb-4">📋</span>
            <h2 className="text-lg font-bold text-slate-200 mb-2">No Items Match Filters</h2>
            <p className="text-sm text-slate-500 max-w-md">
              Try adjusting your filter or changing the store scope to see procurement recommendations.
            </p>
          </div>
        )}
      </div>

      {/* Saved Plans */}
      {savedPlans.length > 0 && (
        <div className="mt-12 pt-8 border-t border-slate-800">
          <h2 className="text-lg font-black text-white uppercase tracking-widest mb-6">Archived Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedPlans.slice(0, 6).map((sp) => (
              <div key={sp.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex justify-between items-center group hover:border-slate-600 transition-all">
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase mb-1">{new Date(sp.plan_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-white font-bold">{formatCurrency(sp.total_estimated_spend)}</p>
                  <p className="text-[9px] text-slate-600 mt-1 uppercase font-bold">{sp.total_products} products • {sp.total_packs} packs</p>
                </div>
                <span className={`px-2 py-1 text-[9px] font-black uppercase rounded ${
                    sp.status === 'open' ? 'bg-blue-500/20 text-blue-400' :
                    sp.status === 'ordered' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                }`}>{sp.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Mobile Action Bar */}
      <div className="md:hidden fixed bottom-[64px] left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 z-30 flex gap-3 pb-safe-bottom">
        <button
          onClick={loadPlan}
          className="flex-1 py-3.5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-[0.98]"
        >
          Refresh Data
        </button>
        <button
          onClick={handleSavePlan}
          disabled={savingPlan || !plan?.items.length}
          className="flex-[2] py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-cyan-900/40 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {savingPlan ? 'Saving...' : 'Commit Plan'}
        </button>
      </div>
    </div>
  );
}
