'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  competitorService,
  PriceSuggestion,
} from '@/lib/services/competitorService';
import { formatCurrency } from '@/lib/utils/currency';
import { Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';

export default function PriceOpportunitiesClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState('ready');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({
    analysed: 0,
    verified: 0,
    opportunities: 0,
    hold: 0,
    missingCost: 0,
    stale: 0,
    reviewRequired: 0,
    locked: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await competitorService.getPricingSuggestions();
      const { data: products } = await supabase.from('products').select('id, name, brand');
      const { data: locks } = await supabase.from('price_locks').select('product_id').eq('is_active', true);
      const lockedIds = new Set((locks || []).map((l: any) => l.product_id));

      const enriched = data.map(s => ({
        ...s,
        product_name: products?.find(p => p.id === s.product_id)?.name || 'Unknown Product',
        brand: products?.find(p => p.id === s.product_id)?.brand || 'N/A',
        is_locked: lockedIds.has(s.product_id),
      }));

      setSuggestions(enriched);
      setStats({
        analysed: enriched.length,
        verified: enriched.filter(s => (s.in_stock_competitor_count || 0) > 0).length,
        opportunities: enriched.filter(s => Math.abs(s.price_difference || 0) > 0.01).length,
        hold: enriched.filter(s => Math.abs(s.price_difference || 0) <= 0.01).length,
        missingCost: enriched.filter(s => s.cost_price === null || s.cost_price === 0).length,
        stale: enriched.filter(s => s.recommendation_status === 'stale').length,
        reviewRequired: enriched.filter(s => s.recommendation_status === 'review_required').length,
        locked: enriched.filter(s => s.is_locked).length,
      });

      const s = await competitorService.getPricingSettings();
      setSettings(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    await competitorService.generateRecommendations();
    await loadData();
    setGenerating(false);
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this price change? This will update the selling price.')) return;
    const res = await competitorService.applySuggestion(id);
    if (res.success) {
      alert('Price updated successfully');
      loadData();
    } else {
      alert(res.error || 'Failed to update price');
    }
  };

  const handleLock = async (productId: string, currentPrice: number) => {
    const reason = prompt('Enter lock reason (optional):', '');
    const res = await competitorService.lockPrice(productId, currentPrice, undefined, reason || undefined);
    if (res.success) {
      alert('Price locked successfully');
      loadData();
    } else {
      alert(res.error || 'Failed to lock price');
    }
  };

  const handleUnlock = async (productId: string) => {
    const res = await competitorService.unlockPrice(productId);
    if (res.success) {
      alert('Price unlocked');
      loadData();
    } else {
      alert(res.error || 'Failed to unlock price');
    }
  };

  const handleViewHistory = async (productId: string) => {
    setSelectedProduct(productId);
    const [history, audit] = await Promise.all([
      competitorService.getPriceHistory(productId),
      competitorService.getPriceChangeAudit(productId),
    ]);
    setPriceHistory(history);
    setAuditHistory(audit);
  };

  const handleSaveSettings = async () => {
    const res = await competitorService.updatePricingSettings({
      daily_target_net_profit: Number(settings?.daily_target_net_profit || 100),
      competitor_undercut_amount: Number(settings?.competitor_undercut_amount || 0.10),
      expected_sales_window_days: Number(settings?.expected_sales_window_days || 30),
      competitor_freshness_window_hours: Number(settings?.competitor_freshness_window_hours || 48),
      max_price_increase_percent: Number(settings?.max_price_increase_percent || 20),
      max_price_decrease_percent: Number(settings?.max_price_decrease_percent || 20),
      pricing_mode: settings?.pricing_mode || 'manual',
      auto_apply_enabled: settings?.auto_apply_enabled || false,
      malluspices_auto_publish: settings?.malluspices_auto_publish || false,
    });
    if (res.success) {
      alert('Settings saved');
      setShowSettings(false);
    } else {
      alert(res.error || 'Failed to save settings');
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return suggestions;
    if (filter === 'ready') return suggestions.filter(s => s.recommendation_status === 'ready');
    if (filter === 'review') return suggestions.filter(s => s.recommendation_status === 'review_required');
    if (filter === 'reduce') return suggestions.filter(s => (s.price_difference || 0) < 0);
    if (filter === 'increase') return suggestions.filter(s => (s.price_difference || 0) > 0);
    if (filter === 'stale') return suggestions.filter(s => s.recommendation_status === 'stale');
    if (filter === 'locked') return suggestions.filter(s => s.is_locked);
    return suggestions;
  }, [suggestions, filter]);

  if (loading && suggestions.length === 0) {
    return <div className="p-8 text-center text-slate-500 animate-pulse font-black uppercase tracking-widest">Loading Opportunities...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tight">Price Opportunity Engine</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Competitor-Aware + Profit-Aware Intelligent Pricing</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700"
          >
            Settings
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
          >
            {generating ? 'Analysing Market...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && settings && (
        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-widest">Pricing Engine Settings</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Daily Target Net Profit</label>
              <input
                type="number"
                step="0.01"
                value={settings.daily_target_net_profit || 100}
                onChange={(e) => setSettings({ ...settings, daily_target_net_profit: parseFloat(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Competitor Undercut Amount</label>
              <input
                type="number"
                step="0.01"
                value={settings.competitor_undercut_amount || 0.10}
                onChange={(e) => setSettings({ ...settings, competitor_undercut_amount: parseFloat(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Sales Window (days)</label>
              <input
                type="number"
                value={settings.expected_sales_window_days || 30}
                onChange={(e) => setSettings({ ...settings, expected_sales_window_days: parseInt(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Freshness Window (hours)</label>
              <input
                type="number"
                value={settings.competitor_freshness_window_hours || 48}
                onChange={(e) => setSettings({ ...settings, competitor_freshness_window_hours: parseInt(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Max Price Increase %</label>
              <input
                type="number"
                value={settings.max_price_increase_percent || 20}
                onChange={(e) => setSettings({ ...settings, max_price_increase_percent: parseFloat(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Max Price Decrease %</label>
              <input
                type="number"
                value={settings.max_price_decrease_percent || 20}
                onChange={(e) => setSettings({ ...settings, max_price_decrease_percent: parseFloat(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Pricing Mode</label>
              <select
                value={settings.pricing_mode || 'manual'}
                onChange={(e) => setSettings({ ...settings, pricing_mode: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              >
                <option value="manual">Manual (Human Approval)</option>
                <option value="automatic">Automatic</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Auto Apply</label>
              <select
                value={settings.auto_apply_enabled ? 'true' : 'false'}
                onChange={(e) => setSettings({ ...settings, auto_apply_enabled: e.target.value === 'true' })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full"
              >
                <option value="false">OFF (Default)</option>
                <option value="true">ON</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
        {[
          { label: 'Analysed', value: stats.analysed, color: 'text-slate-100' },
          { label: 'Verified', value: stats.verified, color: 'text-emerald-400' },
          { label: 'Opportunities', value: stats.opportunities, color: 'text-cyan-400' },
          { label: 'Holds', value: stats.hold, color: 'text-slate-400' },
          { label: 'Missing Cost', value: stats.missingCost, color: 'text-rose-500' },
          { label: 'Review Required', value: stats.reviewRequired, color: 'text-amber-500' },
          { label: 'Stale', value: stats.stale, color: 'text-orange-500' },
          { label: 'Locked', value: stats.locked, color: 'text-purple-400' },
        ].map(card => (
          <div key={card.label} className="bg-slate-900/50 border border-slate-800 p-3 rounded-2xl">
            <p className="text-[9px] font-black text-slate-500 uppercase mb-1">{card.label}</p>
            <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 bg-slate-900/50 p-1 rounded-2xl border border-slate-800 w-fit flex-wrap">
        {[
          { id: 'ready', label: 'Needs Approval' },
          { id: 'review', label: 'Review Required' },
          { id: 'reduce', label: 'Price Reductions' },
          { id: 'increase', label: 'Price Increases' },
          { id: 'locked', label: 'Price Locked' },
          { id: 'stale', label: 'Stale Data' },
          { id: 'all', label: 'All' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === f.id ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-800">
              <th className="text-left p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Product</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Our Price</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Cost</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Lowest Comp</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Avg Comp</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Comp Target</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Profit Floor</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Final Price</th>
              <th className="text-right p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Exp. Margin</th>
              <th className="text-center p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Data Age</th>
              <th className="text-center p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Decision</th>
              <th className="text-center p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Status</th>
              <th className="text-center p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map(s => {
              const currentMargin = s.cost_price ? ((s.current_price - s.cost_price) / s.current_price) * 100 : 0;
              const isIncrease = (s.price_difference || 0) > 0;
              const dataAgeHours = s.competitor_data_age_hours;
              const decisionReason = s.decision_reason || 'UNKNOWN';

              return (
                <tr key={s.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="p-3">
                    <div className="font-bold text-slate-200 text-xs">{s.product_name}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                      {s.brand} | {s.in_stock_competitor_count || 0} comps
                      {s.is_locked && <span className="text-purple-400 ml-1">| LOCKED</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right font-black text-slate-300 whitespace-nowrap">{formatCurrency(s.current_price)}</td>
                  <td className="p-3 text-right text-slate-500 whitespace-nowrap">{s.cost_price ? formatCurrency(s.cost_price) : '-'}</td>
                  <td className="p-3 text-right text-slate-400 whitespace-nowrap">{s.lowest_competitor_price ? formatCurrency(s.lowest_competitor_price) : '-'}</td>
                  <td className="p-3 text-right text-slate-400 whitespace-nowrap">{s.average_market_price ? formatCurrency(s.average_market_price) : '-'}</td>
                  <td className="p-3 text-right text-cyan-400 whitespace-nowrap">{s.competitive_target_price ? formatCurrency(s.competitive_target_price) : '-'}</td>
                  <td className="p-3 text-right text-amber-400 whitespace-nowrap">{s.required_profit_price ? formatCurrency(s.required_profit_price) : '-'}</td>
                  <td className="p-3 text-right font-black text-blue-400 whitespace-nowrap">{formatCurrency(s.suggested_price)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <span className={`font-black ${(s.expected_margin || 0) < 15 ? 'text-amber-500' : 'text-emerald-400'}`}>
                      {(s.expected_margin || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {dataAgeHours != null ? (
                      <span className={`text-[9px] font-bold ${dataAgeHours > 48 ? 'text-rose-500' : dataAgeHours > 24 ? 'text-amber-500' : 'text-emerald-400'}`}>
                        {dataAgeHours < 1 ? '<1h' : `${Math.round(dataAgeHours)}h`}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-600">N/A</span>
                    )}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className={`text-[8px] font-black px-2 py-1 rounded ${
                      decisionReason === 'COMPETE_BELOW_LOWEST' ? 'bg-emerald-500/10 text-emerald-400' :
                      decisionReason === 'PROTECT_REQUIRED_PROFIT' ? 'bg-amber-500/10 text-amber-400' :
                      decisionReason === 'NO_VALID_COMPETITOR_DATA' ? 'bg-slate-700 text-slate-400' :
                      decisionReason === 'MISSING_COST' ? 'bg-rose-500/10 text-rose-400' :
                      decisionReason === 'MISSING_SALES_FORECAST' ? 'bg-orange-500/10 text-orange-400' :
                      decisionReason === 'MANUAL_OVERRIDE' ? 'bg-purple-500/10 text-purple-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {decisionReason.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={
                      s.recommendation_status === 'ready' ? 'warning' :
                      s.recommendation_status === 'applied' ? 'success' :
                      s.recommendation_status === 'stale' ? 'danger' :
                      s.recommendation_status === 'review_required' ? 'info' : 'info'
                    }>
                      {s.recommendation_status?.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <div className="flex gap-1 justify-center">
                      {s.recommendation_status === 'ready' && !s.is_locked && (
                        <button
                          onClick={() => handleApprove(s.id)}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase px-2 py-1 rounded transition-all"
                        >
                          Approve
                        </button>
                      )}
                      {!s.is_locked ? (
                        <button
                          onClick={() => handleLock(s.product_id, s.current_price)}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-[9px] font-black uppercase px-2 py-1 rounded transition-all"
                          title="Lock price"
                        >
                          Lock
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnlock(s.product_id)}
                          className="bg-purple-700 hover:bg-purple-600 text-purple-200 text-[9px] font-black uppercase px-2 py-1 rounded transition-all"
                        >
                          Unlock
                        </button>
                      )}
                      <button
                        onClick={() => handleViewHistory(s.product_id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-[9px] font-black uppercase px-2 py-1 rounded transition-all"
                        title="View history"
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No recommendations found matching filter</p>
            <button onClick={handleGenerate} className="mt-4 text-blue-400 font-black uppercase text-[10px] hover:underline">Run Market Analysis Now</button>
          </div>
        )}
      </div>

      {/* History Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-sm font-black text-slate-200 uppercase">Price History & Audit</h3>
              <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Competitor Price Changes</h4>
                {priceHistory.length === 0 ? (
                  <p className="text-xs text-slate-600">No competitor price changes recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {priceHistory.map((h: any) => (
                      <div key={h.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">{new Date(h.detected_at).toLocaleString()}</span>
                          <span className="text-slate-300 font-bold">
                            {formatCurrency(h.old_price)} → {formatCurrency(h.new_price)}
                            <span className={`ml-2 ${h.percentage_change > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              ({h.percentage_change > 0 ? '+' : ''}{Number(h.percentage_change).toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                        {h.source_product_name && <div className="text-[10px] text-slate-500 mt-1">{h.source_product_name}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase mb-2">Price Change Audit Trail</h4>
                {auditHistory.length === 0 ? (
                  <p className="text-xs text-slate-600">No price changes applied yet.</p>
                ) : (
                  <div className="space-y-2">
                    {auditHistory.map((a: any) => (
                      <div key={a.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
                          <span className="text-slate-300 font-bold">
                            {formatCurrency(a.old_price)} → {formatCurrency(a.new_price)}
                          </span>
                        </div>
                        {a.decision_reason && <div className="text-[10px] text-amber-400 mt-1">{a.decision_reason}</div>}
                        {a.malluspices_sync_status && (
                          <div className="text-[10px] text-slate-500 mt-0.5">MalluSpices: {a.malluspices_sync_status}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Safety Notice */}
      <div className="bg-amber-900/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-4">
        <div>
          <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">Safety Policy Active</p>
          <p className="text-[10px] text-slate-400 leading-relaxed max-w-2xl">
            All prices shown are recommendations based on verified competitor matches and profit targets.
            No price changes without human approval. Final price = MAX(competitive target, required profit price, margin floor).
            Undercut amount: {formatCurrency(settings?.competitor_undercut_amount || 0.10)} below lowest verified competitor.
            Daily profit target: {formatCurrency(settings?.daily_target_net_profit || 100)}.
          </p>
        </div>
      </div>
    </div>
  );
}
