'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import { inventoryForecastService } from '@/lib/services/inventory/inventoryForecastService';
import { useStore } from '@/lib/store/useStore';

export default function InventoryIntelligenceClient({ params, searchParams }: { params?: any; searchParams?: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const selectedStore = stores.find(s => s.id === selectedStoreId);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('inventory_forecasts').select('*, products!product_id(name,cost_price,central_inventory!product_id(stock_quantity,low_stock_threshold))');
      if (selectedStoreId) {
        const { data: storeProductIds } = await supabase.from('store_products').select('product_id').eq('store_id', selectedStoreId).eq('is_active', true);
        const ids = (storeProductIds || []).map(sp => sp.product_id);
        if (ids.length) query = query.in('product_id', ids); else { setForecasts([]); setLoading(false); return; }
      }
      const { data, error } = await query.order('calculated_at', { ascending: false });
      if (error) throw error;
      setForecasts(data || []);
    } catch (err) { console.error('Failed to load inventory intelligence:', err); }
    finally { setLoading(false); }
  }, [selectedStoreId]);

  const handleRunAnalysis = async () => { setRefreshing(true); try { await inventoryForecastService.refreshAllForecasts(50); await loadData(); } catch (err) { console.error('Analysis failed:', err); alert('Failed to run inventory analysis. Check console for details.'); } finally { setRefreshing(false); } };
  useEffect(() => { loadData(); }, [loadData]);
  const filteredForecasts = useMemo(() => forecasts, [forecasts]);

  return <div className="p-6 space-y-8">
    <PageHeader title="Inventory Intelligence" subtitle={`Demand forecasting and stockout risk analysis ${selectedStore ? `for ${selectedStore.name}` : 'across all stores'}.`} action={<div className="flex gap-2"><select value={selectedStoreId || ''} onChange={e => setSelectedStoreId(e.target.value || null)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"><option value="">All Stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><Button onClick={handleRunAnalysis} disabled={refreshing}>{refreshing ? 'Calculating...' : 'Run Stock Analysis'}</Button><Button onClick={loadData} variant="secondary">Refresh View</Button></div>} />
    <StatGrid columns={4}><StatCard label="Critical Risk" value={filteredForecasts.filter(f => f.risk_level === 'critical').length} icon="🔴"/><StatCard label="At Risk" value={filteredForecasts.filter(f => f.risk_level === 'risk').length} icon="🟠"/><StatCard label="Overstock" value={filteredForecasts.filter(f => f.risk_level === 'overstock').length} icon="🔵"/><StatCard label="Slow Moving" value={filteredForecasts.filter(f => f.risk_level === 'slow_moving').length} icon="🟣"/></StatGrid>
    <Card className="p-6 bg-slate-900/50 border-slate-800 overflow-hidden"><h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Stock Health & Coverage</h3><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Daily Sales</th><th className="px-4 py-3 text-right">Days Cover</th><th className="px-4 py-3">Risk Level</th><th className="px-4 py-3">Confidence</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredForecasts.map(f => { const product = Array.isArray(f.products) ? f.products[0] : f.products; const stock = product?.central_inventory?.[0]?.stock_quantity || 0; return <tr key={f.id} className="text-sm hover:bg-slate-800/30 transition-colors"><td className="px-4 py-3 text-slate-200 font-medium">{product?.name || 'Unknown'}</td><td className="px-4 py-3 text-right text-slate-300 font-mono">{stock}</td><td className="px-4 py-3 text-right text-slate-400 font-mono">{Number(f.avg_daily_sales || 0).toFixed(2)}</td><td className="px-4 py-3 text-right"><span className={`font-bold ${f.days_of_cover < 7 ? 'text-rose-400' : 'text-slate-400'}`}>{f.days_of_cover === 999 ? '∞' : f.days_of_cover}d</span></td><td className="px-4 py-3"><Badge variant={f.risk_level === 'critical' ? 'danger' : f.risk_level === 'risk' ? 'warning' : f.risk_level === 'healthy' ? 'success' : 'info'}>{String(f.risk_level || '').toUpperCase()}</Badge></td><td className="px-4 py-3"><span className="text-[10px] uppercase font-black text-slate-400">{f.confidence_level}</span></td></tr>; })}{filteredForecasts.length === 0 && <tr><td colSpan={6} className="py-20 text-center text-slate-500">No intelligence data calculated.</td></tr>}</tbody></table></div></Card>
  </div>;
}
