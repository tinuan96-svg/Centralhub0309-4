'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, PageHeader, StatCard } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import GA4HealthPanel from './GA4HealthPanel';
import GA4RealtimePanel from './GA4RealtimePanel';
import { analyticsService } from '@/lib/services/analytics/analyticsService';
import type { AnalyticsRealtimeStore } from '@/lib/types/analytics';

const daysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };

export default function AnalyticsOverviewClient() {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<AnalyticsRealtimeStore[]>([]);
  const [activeVisitors, setActiveVisitors] = useState<any[]>([]);
  const [daily, setDaily] = useState({ users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [live, visitors, summary] = await Promise.all([
        analyticsService.getRealtime(selectedStoreId || undefined),
        analyticsService.getActiveVisitors(selectedStoreId || undefined),
        selectedStoreId ? analyticsService.getDailySummary(selectedStoreId, daysAgo(30), daysAgo(1)) : Promise.resolve(null),
      ]);
      setRealtime(live); setActiveVisitors(visitors);
      if (summary) setDaily(summary);
      else setDaily({ users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
    } catch (error) {
      console.error('[Analytics] Failed to load analytics data:', error);
      setRealtime([]); setActiveVisitors([]); setDaily({ users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
    } finally { setLoading(false); }
  }, [selectedStoreId]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [load]);

  const totals = realtime.reduce((a, r) => ({
    users: a.users + Number(r.active_users || 0), sessions: a.sessions + Number(r.active_sessions || 0), pages: a.pages + Number(r.page_views || 0), products: a.products + Number(r.product_views || 0), carts: a.carts + Number(r.add_to_carts || 0), checkouts: a.checkouts + Number(r.checkout_users || 0),
  }), { users: 0, sessions: 0, pages: 0, products: 0, carts: 0, checkouts: 0 });

  return (
    <div className="p-6 space-y-8 pb-32">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6"><PageHeader title="Analytics Intelligence" subtitle="Private CentralHub analytics across independently configured stores" /><div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div></div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"><StatCard label="Visitors Now" value={totals.users.toLocaleString()} icon="👥" variant="glass" /><StatCard label="Sessions Now" value={totals.sessions.toLocaleString()} icon="⚡" variant="glass" /><StatCard label="Page Views" value={totals.pages.toLocaleString()} icon="📄" variant="glass" /><StatCard label="Product Views" value={totals.products.toLocaleString()} icon="🛍️" variant="glass" /><StatCard label="Add to Cart" value={totals.carts.toLocaleString()} icon="🛒" variant="glass" /><StatCard label="Checkout" value={totals.checkouts.toLocaleString()} icon="💳" variant="glass" /></div>
      {selectedStoreId && <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex items-center justify-between mb-5"><div><h2 className="text-lg font-black text-white uppercase">Last 30 Days</h2><p className="text-xs text-slate-500 mt-1">Imported historical analytics for the selected store</p></div><span className="text-xs text-slate-500">{loading ? 'Refreshing…' : 'GA4 mirror'}</span></div><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">{[['Users',daily.users],['Sessions',daily.sessions],['Page views',daily.pageViews],['Products',daily.productViews],['Carts',daily.carts],['Checkouts',daily.checkouts],['Purchases',daily.purchases],['Revenue',`£${daily.revenue.toFixed(2)}`]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="text-[9px] uppercase tracking-widest text-slate-600">{label}</p><p className="text-sm font-black text-white mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>)}</div></Card>}
      <GA4HealthPanel storeId={selectedStoreId} />
      <GA4RealtimePanel storeId={selectedStoreId} />
      <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex items-center justify-between mb-5"><div><h2 className="text-lg font-black text-white uppercase">Current Visitors</h2><p className="text-xs text-slate-500 mt-1">Active = heartbeat received within the last 5 minutes • refreshes every 30 seconds</p></div><span className="text-xs text-slate-500">{loading ? 'Refreshing…' : `${activeVisitors.length} active`}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Source</th><th>Campaign</th><th>Current page</th><th>Product</th><th>Last seen</th></tr></thead><tbody>{activeVisitors.map((v, i) => { const store=stores.find(s=>s.id===v.store_id); return <tr key={`${v.store_id}-${v.session_key}-${i}`} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{store?.name || v.store_id}</td><td>{v.source || 'direct'} / {v.medium || 'none'}</td><td>{v.campaign || '—'}</td><td className="max-w-[240px] truncate">{v.current_page_title || v.current_page || '—'}</td><td className="max-w-[220px] truncate">{v.current_product || '—'}</td><td>{Number(v.seconds_since_seen || 0)}s ago</td></tr>; })}</tbody></table>{!loading && activeVisitors.length===0 && <p className="py-12 text-center text-sm text-slate-500">No visitors active in the last 5 minutes.</p>}</div></Card>
      <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex items-center justify-between mb-5"><div><h2 className="text-lg font-black text-white uppercase">Live Store Activity</h2><p className="text-xs text-slate-500 mt-1">Last 30 minutes</p></div><span className="text-xs text-slate-500">{loading ? 'Refreshing…' : 'Live'}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Visitors</th><th>Sessions</th><th>Page views</th><th>Products</th><th>Carts</th><th>Top source</th><th>Top page</th><th>Top product</th></tr></thead><tbody>{realtime.map(row => { const store=stores.find(s=>s.id===row.store_id); return <tr key={row.store_id} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{store?.name || row.store_id}</td><td>{row.active_users}</td><td>{row.active_sessions}</td><td>{row.page_views}</td><td>{row.product_views}</td><td>{row.add_to_carts}</td><td>{row.top_source || '—'}</td><td className="max-w-[180px] truncate">{row.top_page || '—'}</td><td className="max-w-[180px] truncate">{row.top_product || '—'}</td></tr>; })}</tbody></table>{!loading && realtime.length===0 && <p className="py-12 text-center text-sm text-slate-500">No live analytics events have been imported yet.</p>}</div></Card>
    </div>
  );
}
