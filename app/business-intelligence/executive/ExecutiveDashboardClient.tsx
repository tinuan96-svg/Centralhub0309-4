'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button, Badge } from '@/lib/design-system';
import { ProfitAnalysisService, ProfitOrderRow } from '@/lib/services/profitAnalysisService';
import { intelligenceService } from '@/lib/services/marketing/intelligenceService';
import { productEconomicsService } from '@/lib/services/marketing/productEconomicsService';
import { inventoryForecastService } from '@/lib/services/inventory/inventoryForecastService';
import { dataQualityService, QualityIssue } from '@/lib/services/marketing/dataQualityService';
import { formatCurrency } from '@/lib/utils/currency';
import { supabase } from '@/lib/supabase';
import StoreScopeSelector from '@/components/StoreScopeSelector';

const impactTypeForRecommendation = (type: string) => {
  if (type === 'inventory_reorder') return 'inventory_safety';
  if (type === 'pricing' || type === 'promotion' || type === 'profit_protection') return 'profit';
  return 'growth';
};

const confidenceLabel = (confidence: number) => confidence >= 0.8 ? 'HIGH' : confidence >= 0.55 ? 'MEDIUM' : 'LOW';

export default function ExecutiveDashboardClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profitData, setProfitData] = useState<ProfitOrderRow[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [customerStats, setCustomerStats] = useState({ avgLtv: 0, count: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let recommendationQuery = supabase
        .from('intelligence_recommendations')
        .select('id,title,description,reason,expected_impact,confidence,risk_level,recommendation_type,store_id,status,is_stale,created_at')
        .in('status', ['recommended', 'reviewed'])
        .eq('is_stale', false)
        .order('risk_level', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12);

      let customerQuery = supabase.from('customer_intelligence').select('lifetime_value,store_id');

      if (selectedStoreId) {
        recommendationQuery = recommendationQuery.eq('store_id', selectedStoreId);
        customerQuery = customerQuery.eq('store_id', selectedStoreId);
      } else {
        // All Stores uses the explicitly calculated global customer roll-up.
        customerQuery = customerQuery.is('store_id', null);
      }

      const [profit, featureFlags, quality, recommendations, custIntel] = await Promise.all([
        ProfitAnalysisService.getAllProfitOrders({ storeId: selectedStoreId || undefined }),
        intelligenceService.getFeatureFlags(),
        dataQualityService.checkDataQuality(),
        recommendationQuery,
        customerQuery,
      ]);

      setProfitData(profit);
      setFlags(featureFlags);
      setQualityIssues(quality);

      const mappedPriorities = (recommendations.data || []).map((rec: any) => {
        const confidence = Math.max(0, Math.min(1, Number(rec.confidence || 0)));
        const risk = Math.max(1, Math.min(3, Number(rec.risk_level || 1)));
        return {
          id: rec.id,
          title: rec.title || 'Business action',
          summary: rec.description || rec.reason || rec.expected_impact || 'Review this recommendation.',
          primary_impact_type: impactTypeForRecommendation(rec.recommendation_type),
          priority_score: Math.round((risk / 3) * 60 + confidence * 40),
          confidence_level: confidenceLabel(confidence),
        };
      }).sort((a: any, b: any) => b.priority_score - a.priority_score).slice(0, 5);

      setPriorities(mappedPriorities);

      const customers = custIntel.data || [];
      if (customers.length > 0) {
        const totalLtv = customers.reduce((sum: number, customer: any) => sum + Number(customer.lifetime_value || 0), 0);
        setCustomerStats({ avgLtv: totalLtv / customers.length, count: customers.length });
      } else {
        setCustomerStats({ avgLtv: 0, count: 0 });
      }
    } catch (err) {
      console.error('Failed to load executive BI data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const scope = selectedStoreId || undefined;
      await Promise.all([
        intelligenceService.syncAllCustomerIntelligence(scope),
        productEconomicsService.refreshCache(1000, scope),
        inventoryForecastService.refreshAllForecasts(1000, scope),
      ]);
      await loadData();
    } catch (err) {
      console.error('Full refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const revenue = profitData.reduce((sum, order) => sum + order.total, 0);
    const profit = profitData.reduce((sum, order) => sum + order.gross_profit, 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, profit, margin, count: profitData.length };
  }, [profitData]);

  const topStore = useMemo(() => {
    if (profitData.length === 0) return { name: '—', share: 0 };
    const storeRevenue: Record<string, number> = {};
    let totalRevenue = 0;

    profitData.forEach(order => {
      const revenue = order.total;
      const storeKey = order.store_id || 'unknown';
      storeRevenue[storeKey] = (storeRevenue[storeKey] || 0) + revenue;
      totalRevenue += revenue;
    });

    let maxRevenue = -1;
    let maxId = '';
    Object.entries(storeRevenue).forEach(([id, revenue]) => {
      if (revenue > maxRevenue) {
        maxRevenue = revenue;
        maxId = id;
      }
    });

    const storeName = profitData.find(order => (order.store_id || 'unknown') === maxId)?.store_name || 'Unknown';
    return { name: storeName, share: totalRevenue > 0 ? (maxRevenue / totalRevenue) * 100 : 0 };
  }, [profitData]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading Executive Intelligence...</div>;

  if (!flags.executive_bi_enabled) {
    return (
      <div className="p-12 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-white">Executive BI is currently disabled</h2>
        <p className="text-slate-400 mt-2">Enable this module in System Settings to view high-level performance data.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 mb-4">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>
      <PageHeader
        title="Executive BI"
        subtitle="Consolidated performance metrics and intelligence snapshots."
        action={
          <div className="flex gap-2">
            <Button onClick={handleRefreshAll} disabled={refreshing}>{refreshing ? 'Analyzing...' : 'Run Full Intelligence Scan'}</Button>
            <Button onClick={loadData} variant="secondary">Refresh Data</Button>
          </div>
        }
      />

      <StatGrid columns={4}>
        <StatCard label="Total Revenue" value={formatCurrency(stats.revenue)} icon="💰" />
        <StatCard label="Gross Profit" value={formatCurrency(stats.profit)} icon="📈" />
        <StatCard label="Avg Margin" value={`${stats.margin.toFixed(1)}%`} icon="🎯" />
        <StatCard label="Paid Orders" value={stats.count.toString()} icon="📦" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div id="approvals" className="lg:col-span-2">
          <Card className="p-6 h-full bg-slate-900/50 border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">Today&apos;s Priorities</h3>
              <Badge variant="info">{priorities.length} ACTIONS</Badge>
            </div>

            <div className="space-y-4">
              {priorities.map(priority => (
                <div key={priority.id} className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex justify-between items-center group hover:border-blue-500/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-950 flex items-center justify-center text-xl">
                      {priority.primary_impact_type === 'profit' ? '💰' : priority.primary_impact_type === 'inventory_safety' ? '📦' : '📈'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-200">{priority.title}</p>
                      <p className="text-xs text-slate-500">{priority.summary}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={priority.priority_score > 80 ? 'danger' : 'warning'} className="text-[9px]">PRIORITY {priority.priority_score}</Badge>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase font-black">{priority.confidence_level} Confidence</p>
                  </div>
                </div>
              ))}
              {priorities.length === 0 && (
                <div className="py-20 text-center border border-dashed border-slate-800 rounded-2xl">
                  <p className="text-slate-500 italic">No current, non-stale recommendations in this scope.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-6 bg-slate-900/50 border-slate-800 flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-tight">Intelligence Brief</h3>
          <div className="space-y-4 flex-1">
            {qualityIssues.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 mb-4">
                <p className="text-[10px] text-rose-400 font-bold uppercase mb-2">Data Quality Alerts</p>
                <ul className="space-y-1">
                  {qualityIssues.map((issue, index) => (
                    <li key={index} className="text-[11px] text-slate-300 flex items-start gap-2">
                      <span className={issue.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'}>•</span>{issue.issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Market Insight</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {priorities.length > 0 ? `Highest-priority action: ${priorities[0].title}. Review it before taking action.` : 'No current recommendation requires immediate review.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">System Health</p>
              <p className="text-sm text-slate-300">
                {qualityIssues.length === 0 ? 'No current data-quality alerts were detected by the configured checks.' : `${qualityIssues.length} data-quality alert${qualityIssues.length === 1 ? '' : 's'} require review before relying on affected decisions.`}
              </p>
            </div>
          </div>
          <Button variant="ghost" className="w-full mt-6 text-xs border border-slate-800" onClick={loadData}>Refresh Brief</Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-4 border-slate-800">
          <p className="text-[10px] text-slate-500 font-black uppercase mb-3">Top Store</p>
          <div className="flex justify-between items-end"><span className="text-lg font-bold text-white truncate max-w-[120px]">{topStore.name}</span><Badge variant="success">{topStore.share.toFixed(0)}% Share</Badge></div>
        </Card>
        <Card className="p-4 border-slate-800">
          <p className="text-[10px] text-slate-500 font-black uppercase mb-3">Customer LTV</p>
          <div className="flex justify-between items-end"><span className="text-lg font-bold text-white">{customerStats.count > 0 ? formatCurrency(customerStats.avgLtv) : '—'}</span><span className="text-[10px] text-slate-400">{customerStats.count} customers</span></div>
        </Card>
        <Card className="p-4 border-slate-800">
          <p className="text-[10px] text-slate-500 font-black uppercase mb-3">CAC</p>
          <div className="flex justify-between items-end"><span className="text-lg font-bold text-slate-500 italic text-sm">DATA N/A</span><span className="text-[10px] text-slate-500">No ad-spend data</span></div>
        </Card>
        <Card className="p-4 border-slate-800">
          <p className="text-[10px] text-slate-500 font-black uppercase mb-3">POAS</p>
          <div className="flex justify-between items-end"><span className="text-lg font-bold text-slate-500 italic text-sm">DATA N/A</span><span className="text-[10px] text-slate-500">Awaiting attribution</span></div>
        </Card>
      </div>
    </div>
  );
}
