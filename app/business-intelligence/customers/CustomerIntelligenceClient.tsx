'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import { intelligenceService } from '@/lib/services/marketing/intelligenceService';
import { formatCurrency } from '@/lib/utils/currency';
import { useStore } from '@/lib/store/useStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function CustomerIntelligenceClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customer_intelligence')
        .select('*');

      // In customer_intelligence, store_id might be relevant if the segments are store-specific.
      // If the table doesn't have store_id, this might fail, but let's check first.
      // Assuming customer_intelligence has store_id based on prompt.
      if (selectedStoreId) {
        query = query.eq('store_id', selectedStoreId);
      } else {
        query = query.is('store_id', null);
      }

      const { data: intel, error } = await query.order('lifetime_value', { ascending: false });

      if (error) throw error;
      setData(intel || []);
    } catch (err) {
      console.error('Failed to load customer intelligence:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  const handleRunSync = async () => {
    setRefreshing(true);
    try {
      await intelligenceService.syncAllCustomerIntelligence();
      await loadData();
    } catch (err) {
       console.error('Sync failed:', err);
       alert('Failed to sync customer intelligence.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const totalRevenue = data.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
    const totalProfit = data.reduce((sum, c) => sum + (c.lifetime_profit || 0), 0);
    const avgLtv = totalRevenue / (data.length || 1);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const atRiskCount = data.filter(c => c.lifecycle_stage === 'at_risk' || c.lifecycle_stage === 'churned').length;

    return {
      totalRevenue,
      avgLtv,
      avgMargin,
      atRiskCount,
      vipCount: data.filter(c => c.lifecycle_stage === 'vip').length
    };
  }, [data]);

  return (
    <div className="p-6 space-y-8">
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 mb-4">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>
      <PageHeader
        title="Customer Intelligence"
        subtitle="Behavioral retention metrics and value optimization."
        action={
          <div className="flex gap-2">
             <Button onClick={handleRunSync} disabled={refreshing}>
                {refreshing ? 'Syncing...' : 'Sync Lifecycle Data'}
             </Button>
             <Button onClick={loadData} variant="secondary">Refresh View</Button>
          </div>
        }
      />

      <StatGrid columns={4}>
         <StatCard label="Avg Customer LTV" value={formatCurrency(stats.avgLtv)} icon="💎" />
         <StatCard label="At Risk / Churned" value={stats.atRiskCount.toString()} icon="⚠️" trend={{ value: 4, isPositive: false }} />
         <StatCard label="Avg Profit Margin" value={`${stats.avgMargin.toFixed(1)}%`} icon="📈" />
         <StatCard label="Total Cust Revenue" value={formatCurrency(stats.totalRevenue)} icon="💰" />
      </StatGrid>

      <Card className="p-6 bg-slate-900/50 border-slate-800 overflow-hidden">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Retention & Value Opportunities</h3>
        <div className="overflow-x-auto">
           <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                 <tr>
                    <th className="px-4 py-3">Customer Key</th>
                    <th className="px-4 py-3 text-right">LTV</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3 text-right">Churn Prob.</th>
                    <th className="px-4 py-3 text-right">Reorder In.</th>
                    <th className="px-4 py-3">Health</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                 {data.map(item => (
                    <tr key={item.id} className="text-sm hover:bg-slate-800/30 transition-colors">
                       <td className="px-4 py-3">
                          <div className="font-medium text-slate-200 truncate max-w-[180px]">{item.customer_email || item.customer_key}</div>
                          <div className="text-[10px] text-slate-500">Last order: {new Date(item.last_order_at).toLocaleDateString()}</div>
                       </td>
                       <td className="px-4 py-3 text-right text-slate-100 font-bold">{formatCurrency(item.lifetime_value)}</td>
                       <td className="px-4 py-3 text-right text-slate-400">{item.order_count}</td>
                       <td className="px-4 py-3">
                          <Badge variant={
                             item.lifecycle_stage === 'vip' ? 'success' :
                             item.lifecycle_stage === 'at_risk' ? 'warning' :
                             item.lifecycle_stage === 'churned' ? 'danger' : 'info'
                          }>
                             {item.lifecycle_stage.toUpperCase()}
                          </Badge>
                       </td>
                       <td className="px-4 py-3 text-right font-mono">
                          <span className={item.churn_probability > 0.7 ? 'text-rose-400' : 'text-slate-400'}>
                             {Math.round((item.churn_probability || 0) * 100)}%
                          </span>
                       </td>
                       <td className="px-4 py-3 text-right text-slate-400">
                          {item.avg_reorder_interval_days ? `${item.avg_reorder_interval_days}d` : '—'}
                       </td>
                       <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                             <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${item.health_score > 80 ? 'bg-emerald-500' : item.health_score > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${item.health_score || 0}%` }}
                                />
                             </div>
                          </div>
                       </td>
                    </tr>
                 ))}
                 {data.length === 0 && (
                   <tr>
                      <td colSpan={7} className="py-20 text-center">
                         <div className="text-4xl mb-4 opacity-20">👥</div>
                         <p className="text-slate-400 font-bold uppercase tracking-widest">No Customer Intelligence Data</p>
                         <p className="text-xs text-slate-600 mt-1 uppercase tracking-tighter">Click &quot;Sync Lifecycle Data&quot; to calculate segments</p>
                      </td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      </Card>
    </div>
  );
}
