'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, CardContent, CardHeader, CardTitle, StatGrid, StatCard, Button, Badge, designTokens } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingAnalyticsService } from '@/lib/services/marketing/marketingAnalyticsService';

export default function MarketingAnalytics() {
  const { selectedStore } = useStore();
  const [topCampaigns, setTopCampaigns] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [attribution, setAttribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attributionModel] = useState('last-non-direct + multi-touch journey');

  const loadAnalytics = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const storeId = selectedStore?.id;
      const [ranking, traffic, productData, attributionData] = await Promise.all([
        marketingAnalyticsService.getCampaignRanking(storeId),
        marketingAnalyticsService.getTrafficChannels(storeId),
        marketingAnalyticsService.getProductPerformance(storeId),
        storeId ? marketingAnalyticsService.getAttributionSummary(storeId) : Promise.resolve([]),
      ]);
      setTopCampaigns(ranking); setChannels(traffic); setProducts(productData); setAttribution(attributionData);
    } catch (err) {
      console.error('Failed to load live marketing analytics:', err);
      setError('Live analytics could not be loaded. No synthetic data is shown.');
    } finally { setLoading(false); }
  }, [selectedStore?.id]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  const totals = useMemo(() => channels.reduce((a, c) => ({
    users: a.users + Number(c.users || 0), sessions: a.sessions + Number(c.sessions || 0),
    pageViews: a.pageViews + Number(c.page_views || 0), productViews: a.productViews + Number(c.product_views || 0),
    carts: a.carts + Number(c.add_to_carts || 0), checkouts: a.checkouts + Number(c.checkouts || 0),
    purchases: a.purchases + Number(c.purchases || 0), revenue: a.revenue + Number(c.revenue || 0),
  }), { users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 }), [channels]);

  const campaignSpend = topCampaigns.reduce((n, c) => n + Number(c.spend || 0), 0);
  const campaignRevenue = topCampaigns.reduce((n, c) => n + Number(c.revenue || 0), 0);
  const roas = campaignSpend > 0 ? campaignRevenue / campaignSpend : 0;

  return (
    <div className={designTokens.spacing.page}><div className={designTokens.layout.containerMax}>
      <PageHeader icon="🎯" title="Marketing Analytics Hub" subtitle={selectedStore ? `Live performance for ${selectedStore.name}` : 'Live analytics across connected stores.'} action={<Button variant="secondary" onClick={() => void loadAnalytics()}>{loading ? 'Refreshing…' : 'Refresh'}</Button>} />
      {error && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent><p className="text-sm text-amber-300">{error}</p></CardContent></Card>}
      <div className={designTokens.spacing.section}>
        <StatGrid columns={5}>
          <StatCard label="Visitors" value={totals.users.toLocaleString()} icon="👥" /><StatCard label="Sessions" value={totals.sessions.toLocaleString()} icon="⚡" /><StatCard label="Purchases" value={totals.purchases.toLocaleString()} icon="🛒" /><StatCard label="Attributed Revenue" value={`£${totals.revenue.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} icon="💎" /><StatCard label="Campaign ROAS" value={`${roas.toFixed(2)}x`} icon="📈" />
        </StatGrid>

        <Card><CardHeader><CardTitle>Traffic & Conversion Channels</CardTitle><p className={designTokens.typography.body}>Real CentralHub events; no placeholder traffic figures.</p></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className={`border-b ${designTokens.colors.border.default}`}>{['Source','Medium','Campaign','Visitors','Sessions','Product views','Carts','Checkout','Orders','Revenue'].map(h=><th key={h} className={`pb-3 pr-4 ${designTokens.typography.label}`}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{channels.map((c,i)=><tr key={`${c.source}-${c.medium}-${c.campaign}-${i}`}><td className="py-3 pr-4 font-medium text-white">{c.source}</td><td className="pr-4 text-slate-400">{c.medium}</td><td className="pr-4 text-slate-400">{c.campaign}</td><td>{Number(c.users||0).toLocaleString()}</td><td>{Number(c.sessions||0).toLocaleString()}</td><td>{Number(c.product_views||0).toLocaleString()}</td><td>{Number(c.add_to_carts||0).toLocaleString()}</td><td>{Number(c.checkouts||0).toLocaleString()}</td><td>{Number(c.purchases||0).toLocaleString()}</td><td className="font-semibold">£{Number(c.revenue||0).toFixed(2)}</td></tr>)}</tbody></table>{!loading&&channels.length===0&&<p className="py-10 text-center text-sm text-slate-500">No live traffic events yet.</p>}</div></CardContent></Card>

        <Card><CardHeader><CardTitle>Multi-touch Attribution</CardTitle><p className={designTokens.typography.body}>How marketing interactions contributed to converted orders.</p></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className={`border-b ${designTokens.colors.border.default}`}>{['Source','Medium','Campaign','First-touch orders','Last-touch orders','Assisted orders','Revenue'].map(h=><th key={h} className={`pb-3 pr-4 ${designTokens.typography.label}`}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{attribution.map((a,i)=><tr key={`${a.source}-${a.medium}-${a.campaign}-${i}`}><td className="py-3 pr-4 font-medium text-white">{a.source}</td><td className="pr-4 text-slate-400">{a.medium}</td><td className="pr-4 text-slate-400">{a.campaign}</td><td>{Number(a.first_touch_orders||0)}</td><td>{Number(a.last_touch_orders||0)}</td><td><Badge variant={Number(a.assisted_orders||0)>0?'success':'info'}>{Number(a.assisted_orders||0)}</Badge></td><td className="font-semibold">£{Number(a.revenue||0).toFixed(2)}</td></tr>)}</tbody></table>{!loading&&attribution.length===0&&<p className="py-8 text-center text-sm text-slate-500">No attributed orders yet.</p>}</div></CardContent></Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card><CardHeader><CardTitle>Product Intelligence</CardTitle><p className={designTokens.typography.body}>Real product view, cart and purchase events.</p></CardHeader><CardContent><div className="space-y-3">{products.slice(0,20).map((p,i)=><div key={`${p.product_id||'unknown'}-${i}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/30"><div><p className="text-sm font-medium text-white">{p.product_name}</p><p className="text-xs text-slate-500">Views {Number(p.views||0).toLocaleString()} • Carts {Number(p.add_to_carts||0).toLocaleString()} • Orders {Number(p.purchases||0).toLocaleString()}</p></div><p className="font-bold text-white">£{Number(p.revenue||0).toFixed(2)}</p></div>)}{!loading&&products.length===0&&<p className="py-10 text-center text-sm text-slate-500">No product analytics yet.</p>}</div></CardContent></Card>

        <Card><CardHeader><CardTitle>Campaign Performance</CardTitle><p className={designTokens.typography.body}>Existing campaign spend and conversion records remain separate from event attribution.</p></CardHeader><CardContent><div className="space-y-3">{topCampaigns.slice(0,20).map((c,i)=><div key={c.id||i} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/30"><div><p className="text-sm font-medium text-white">{c.name}</p><p className="text-xs text-slate-500">Orders {Number(c.conversions||0).toLocaleString()} • Spend £{(Number(c.spend||0)/100).toFixed(2)}</p></div><div className="text-right"><p className="font-bold text-white">£{(Number(c.revenue||0)/100).toFixed(2)}</p><Badge variant={Number(c.roas||0)>=1?'success':'info'}>{Number(c.roas||0).toFixed(2)}x</Badge></div></div>)}{!loading&&topCampaigns.length===0&&<p className="py-10 text-center text-sm text-slate-500">No campaign performance records yet.</p>}</div></CardContent></Card></div>

        <Card className="bg-gradient-to-br from-slate-900/80 to-slate-950 border-blue-500/20"><CardHeader><CardTitle>Attribution Model</CardTitle></CardHeader><CardContent><div className="flex flex-wrap gap-4 text-sm text-slate-300"><span>Model: <strong className="text-white">{attributionModel}</strong></span><span>•</span><span>Events: {totals.pageViews.toLocaleString()} page views</span><span>•</span><span>Checkout: {totals.checkouts.toLocaleString()}</span><span>•</span><span>Revenue: £{totals.revenue.toFixed(2)}</span></div></CardContent></Card>
      </div></div></div>
  );
}