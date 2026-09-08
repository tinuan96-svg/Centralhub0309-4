'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, StatCard } from '@/lib/design-system';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import { useStore } from '@/lib/store/useStore';
import { analyticsService } from '@/lib/services/analytics/analyticsService';
import { supabase } from '@/lib/supabase';
import type { AnalyticsRealtimeStore } from '@/lib/types/analytics';
import GA4HealthPanel from './GA4HealthPanel';
import GA4RealtimePanel from './GA4RealtimePanel';

type DailySummary = {
  users: number;
  sessions: number;
  pageViews: number;
  productViews: number;
  carts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
};

type GroupRow = { label: string; count: number };

const sectionLinks = [
  ['overview', 'Overview'],
  ['growth', 'Growth & Trends'],
  ['website-ga4', 'Website & GA4'],
  ['realtime', 'Realtime Visitors'],
  ['visitors', 'Visitor Tracking'],
  ['traffic-attribution', 'Traffic & Attribution'],
  ['geography', 'Geography & Devices'],
  ['ecommerce', 'Ecommerce'],
  ['search-console', 'Google Search'],
  ['apps', 'Play & App Store'],
  ['health', 'Data Health'],
] as const;

const emptyDaily = (): DailySummary => ({ users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
const daysAgo = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
const money = (value: number) => `£${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (now: number, before: number) => before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0;

function sumDaily(rows: any[]): DailySummary {
  return rows.reduce((a, r) => ({
    users: a.users + Number(r.users || 0),
    sessions: a.sessions + Number(r.sessions || 0),
    pageViews: a.pageViews + Number(r.page_views || 0),
    productViews: a.productViews + Number(r.product_views || 0),
    carts: a.carts + Number(r.add_to_carts || 0),
    checkouts: a.checkouts + Number(r.checkouts || 0),
    purchases: a.purchases + Number(r.purchases || 0),
    revenue: a.revenue + Number(r.revenue || 0),
  }), emptyDaily());
}

function groupSessions(rows: any[], key: 'country' | 'city' | 'device_category' | 'browser', limit = 10): GroupRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] || '').trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export default function AnalyticsOverviewClient() {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<AnalyticsRealtimeStore[]>([]);
  const [activeVisitors, setActiveVisitors] = useState<any[]>([]);
  const [dailyRows, setDailyRows] = useState<any[]>([]);
  const [sessionRows, setSessionRows] = useState<any[]>([]);
  const [attributionRows, setAttributionRows] = useState<any[]>([]);
  const [searchRows, setSearchRows] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [appMetrics, setAppMetrics] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const from60 = daysAgo(60);
    const from30 = daysAgo(30);

    let daily = supabase.from('analytics_daily_metrics').select('store_id,metric_date,source,medium,campaign,users,sessions,engaged_sessions,page_views,product_views,add_to_carts,checkouts,purchases,revenue').gte('metric_date', from60).order('metric_date').limit(5000);
    let sessions = supabase.from('analytics_sessions').select('store_id,session_key,anonymous_id,source,medium,campaign,country,region,city,device_category,browser,operating_system,started_at,last_seen_at,page_count,event_count,engaged,converted').gte('started_at', `${from30}T00:00:00Z`).order('started_at', { ascending: false }).limit(5000);
    let attribution = supabase.from('analytics_campaign_attribution').select('store_id,source,medium,campaign_name,visitors,sessions,product_views,add_to_carts,checkouts,orders,revenue,spend,updated_at').order('updated_at', { ascending: false }).limit(2000);
    let search = supabase.from('search_console_daily_metrics').select('store_id,metric_date,query,page,country,device,clicks,impressions,ctr,position').gte('metric_date', from30).order('metric_date', { ascending: false }).limit(5000);
    let appList = supabase.from('app_marketing_apps').select('id,store_id,platform,package_identifier,display_name,external_app_id,status,metadata').order('display_name').limit(200);

    if (selectedStoreId) {
      daily = daily.eq('store_id', selectedStoreId);
      sessions = sessions.eq('store_id', selectedStoreId);
      attribution = attribution.eq('store_id', selectedStoreId);
      search = search.eq('store_id', selectedStoreId);
      appList = appList.eq('store_id', selectedStoreId);
    }

    const tasks: Array<{ label: string; promise: PromiseLike<any> }> = [
      { label: 'Realtime', promise: analyticsService.getRealtime(selectedStoreId || undefined) },
      { label: 'Active visitors', promise: analyticsService.getActiveVisitors(selectedStoreId || undefined) },
      { label: 'Website trends', promise: daily },
      { label: 'Visitor dimensions', promise: sessions },
      { label: 'Attribution', promise: attribution },
      { label: 'Search Console', promise: search },
      { label: 'Apps', promise: appList },
      { label: 'App metrics', promise: supabase.from('app_marketing_daily_metrics').select('app_id,metric_date,impressions,product_page_views,downloads,installs,active_users,crashes,conversions,spend,revenue,currency').gte('metric_date', from60).order('metric_date', { ascending: false }).limit(5000) },
    ];

    const settled = await Promise.allSettled(tasks.map(t => t.promise));
    const nextErrors: string[] = [];
    const rows = (index: number): any[] => {
      const result = settled[index];
      if (result.status === 'rejected') {
        nextErrors.push(`${tasks[index].label}: ${String((result.reason as any)?.message || result.reason || 'failed')}`);
        return [];
      }
      const payload = result.value;
      if (payload?.error) {
        nextErrors.push(`${tasks[index].label}: ${payload.error.message || 'failed'}`);
        return [];
      }
      return Array.isArray(payload) ? payload : payload?.data || [];
    };

    setRealtime(rows(0) as AnalyticsRealtimeStore[]);
    setActiveVisitors(rows(1));
    setDailyRows(rows(2));
    setSessionRows(rows(3));
    setAttributionRows(rows(4));
    setSearchRows(rows(5));
    const appRows = rows(6);
    const visibleIds = new Set(appRows.map((app: any) => app.id));
    setApps(appRows);
    setAppMetrics(rows(7).filter((metric: any) => visibleIds.has(metric.app_id)));
    setErrors(nextErrors);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const liveTotals = useMemo(() => realtime.reduce((a, row) => ({
    users: a.users + Number(row.active_users || 0),
    sessions: a.sessions + Number(row.active_sessions || 0),
  }), { users: 0, sessions: 0 }), [realtime]);

  const currentRows = useMemo(() => dailyRows.filter(r => String(r.metric_date) >= daysAgo(30)), [dailyRows]);
  const previousRows = useMemo(() => dailyRows.filter(r => String(r.metric_date) >= daysAgo(60) && String(r.metric_date) < daysAgo(30)), [dailyRows]);
  const current = useMemo(() => sumDaily(currentRows), [currentRows]);
  const previous = useMemo(() => sumDaily(previousRows), [previousRows]);

  const trend = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const row of currentRows) {
      const date = String(row.metric_date);
      const total = map.get(date) || emptyDaily();
      total.users += Number(row.users || 0); total.sessions += Number(row.sessions || 0); total.pageViews += Number(row.page_views || 0); total.productViews += Number(row.product_views || 0); total.carts += Number(row.add_to_carts || 0); total.checkouts += Number(row.checkouts || 0); total.purchases += Number(row.purchases || 0); total.revenue += Number(row.revenue || 0);
      map.set(date, total);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [currentRows]);

  const traffic = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of currentRows) {
      const source = row.source || '(direct)', medium = row.medium || '(none)', campaign = row.campaign || '(not set)';
      const key = `${source}|${medium}|${campaign}`;
      const item = map.get(key) || { source, medium, campaign, users: 0, sessions: 0, purchases: 0, revenue: 0 };
      item.users += Number(row.users || 0); item.sessions += Number(row.sessions || 0); item.purchases += Number(row.purchases || 0); item.revenue += Number(row.revenue || 0);
      map.set(key, item);
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 15);
  }, [currentRows]);

  const geoGroups = useMemo<Array<{ label: string; rows: GroupRow[] }>>(() => [
    { label: 'Countries', rows: groupSessions(sessionRows, 'country', 12) },
    { label: 'Cities', rows: groupSessions(sessionRows, 'city', 12) },
    { label: 'Devices', rows: groupSessions(sessionRows, 'device_category', 10) },
    { label: 'Browsers', rows: groupSessions(sessionRows, 'browser', 10) },
  ], [sessionRows]);

  const searchTotals = useMemo(() => searchRows.reduce((a, row) => ({
    clicks: a.clicks + Number(row.clicks || 0),
    impressions: a.impressions + Number(row.impressions || 0),
    weightedPosition: a.weightedPosition + Number(row.position || 0) * Number(row.impressions || 0),
  }), { clicks: 0, impressions: 0, weightedPosition: 0 }), [searchRows]);

  const topQueries = useMemo(() => {
    const map = new Map<string, { label: string; clicks: number; impressions: number }>();
    for (const row of searchRows) {
      const query = String(row.query || '').trim();
      if (!query) continue;
      const item = map.get(query) || { label: query, clicks: 0, impressions: 0 };
      item.clicks += Number(row.clicks || 0); item.impressions += Number(row.impressions || 0); map.set(query, item);
    }
    return [...map.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 12);
  }, [searchRows]);

  const appSummaries = useMemo(() => apps.map(app => {
    const metrics = appMetrics.filter(m => m.app_id === app.id);
    const sum = (list: any[]) => list.reduce((a, m) => ({
      views: a.views + Number(m.product_page_views || 0), installs: a.installs + Number(m.installs || 0), active: a.active + Number(m.active_users || 0), crashes: a.crashes + Number(m.crashes || 0), conversions: a.conversions + Number(m.conversions || 0), revenue: a.revenue + Number(m.revenue || 0),
    }), { views: 0, installs: 0, active: 0, crashes: 0, conversions: 0, revenue: 0 });
    const now = sum(metrics.filter(m => String(m.metric_date) >= daysAgo(30)));
    const before = sum(metrics.filter(m => String(m.metric_date) >= daysAgo(60) && String(m.metric_date) < daysAgo(30)));
    return { ...app, metrics: now, installGrowth: pct(now.installs, before.installs) };
  }).sort((a, b) => b.metrics.installs - a.metrics.installs), [apps, appMetrics]);

  const selectedStore = selectedStoreId ? stores.find(store => store.id === selectedStoreId) : null;

  return (
    <div className="p-4 md:p-6 space-y-8 pb-32 max-w-[1600px] mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <PageHeader title="Analytics Centre" subtitle={selectedStore ? `Website, customer, search and app analytics for ${selectedStore.name}` : 'Website, customer, search and app analytics across all CentralHub stores'} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center"><div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div><button onClick={() => void load()} className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white font-bold">{loading ? 'Refreshing…' : 'Refresh all'}</button></div>
      </div>

      <Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="flex gap-2 overflow-x-auto pb-1">{sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`} className="whitespace-nowrap px-3 py-2 rounded-xl border border-slate-800 bg-slate-950/60 text-xs font-bold text-slate-300 hover:text-white hover:border-cyan-500/40">{label}</a>)}</div></Card>
      {errors.length > 0 && <Card className="p-4 bg-amber-500/5 border-amber-500/20 rounded-2xl"><p className="text-sm font-bold text-amber-300">Some analytics sources are not ready yet.</p><p className="text-xs text-amber-200/70 mt-1">{errors.join(' • ')}</p></Card>}

      <section id="overview" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-xl font-black text-white">Overview</h2><p className="text-sm text-slate-500">Live activity plus the latest 30-day business view.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"><StatCard label="Visitors Now" value={liveTotals.users.toLocaleString()} icon="👥" variant="glass" /><StatCard label="Sessions Now" value={liveTotals.sessions.toLocaleString()} icon="⚡" variant="glass" /><StatCard label="30d Users" value={current.users.toLocaleString()} icon="📈" variant="glass" /><StatCard label="30d Orders" value={current.purchases.toLocaleString()} icon="🛒" variant="glass" /><StatCard label="30d Revenue" value={money(current.revenue)} icon="💎" variant="glass" /><StatCard label="Search Clicks" value={searchTotals.clicks.toLocaleString()} icon="🔎" variant="glass" /></div>
      </section>

      <section id="growth" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-xl font-black text-white">Growth & Trends</h2><p className="text-sm text-slate-500">Latest 30 days compared with the preceding 30 days.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
          { label: 'Users', value: current.users.toLocaleString(), change: pct(current.users, previous.users) },
          { label: 'Sessions', value: current.sessions.toLocaleString(), change: pct(current.sessions, previous.sessions) },
          { label: 'Orders', value: current.purchases.toLocaleString(), change: pct(current.purchases, previous.purchases) },
          { label: 'Revenue', value: money(current.revenue), change: pct(current.revenue, previous.revenue) },
        ].map(item => <Card key={item.label} className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{item.label}</p><p className="text-2xl font-black text-white mt-1">{item.value}</p><p className={`text-xs mt-1 font-bold ${item.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{item.change >= 0 ? '+' : ''}{item.change.toFixed(1)}% vs previous 30d</p></Card>)}</div>
        <Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left py-2">Date</th><th className="text-right">Users</th><th className="text-right">Sessions</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead><tbody>{trend.map(([date, row]) => <tr key={date} className="border-t border-slate-800"><td className="py-3 text-slate-300">{date}</td><td className="text-right">{row.users.toLocaleString()}</td><td className="text-right">{row.sessions.toLocaleString()}</td><td className="text-right">{row.purchases.toLocaleString()}</td><td className="text-right font-bold text-white">{money(row.revenue)}</td></tr>)}</tbody></table>{!loading && trend.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No historical website metrics imported yet.</p>}</div></Card>
      </section>

      <section id="website-ga4" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Website & Google Analytics 4</h2><p className="text-sm text-slate-500">GA4 property health, sync state and imported website metrics.</p></div><GA4HealthPanel storeId={selectedStoreId} /></section>

      <section id="realtime" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Realtime Visitors</h2><p className="text-sm text-slate-500">GA4 realtime plus CentralHub's live event mirror.</p></div><GA4RealtimePanel storeId={selectedStoreId} /><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Visitors</th><th>Sessions</th><th>Page views</th><th>Products</th><th>Carts</th><th>Top source</th><th>Top page</th></tr></thead><tbody>{realtime.map(row => <tr key={row.store_id} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{stores.find(s => s.id === row.store_id)?.name || row.store_id}</td><td>{row.active_users}</td><td>{row.active_sessions}</td><td>{row.page_views}</td><td>{row.product_views}</td><td>{row.add_to_carts}</td><td>{row.top_source || '—'}</td><td className="max-w-[260px] truncate">{row.top_page || '—'}</td></tr>)}</tbody></table>{!loading && realtime.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No realtime events available yet.</p>}</div></Card></section>

      <section id="visitors" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Visitor Tracking</h2><p className="text-sm text-slate-500">Privacy-safe live sessions, traffic source, campaign and current page.</p></div><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="flex justify-between mb-4 text-xs"><span className="text-slate-500">Active heartbeat within the live window</span><span className="text-cyan-300 font-bold">{activeVisitors.length} active</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Source</th><th>Campaign</th><th>Current page</th><th>Product</th><th>Last seen</th></tr></thead><tbody>{activeVisitors.map((v, i) => <tr key={`${v.store_id}-${v.session_key}-${i}`} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{stores.find(s => s.id === v.store_id)?.name || v.store_id}</td><td>{v.source || 'direct'} / {v.medium || 'none'}</td><td>{v.campaign || '—'}</td><td className="max-w-[280px] truncate">{v.current_page_title || v.current_page || '—'}</td><td className="max-w-[220px] truncate">{v.current_product || '—'}</td><td>{Number(v.seconds_since_seen || 0)}s ago</td></tr>)}</tbody></table>{!loading && activeVisitors.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No currently active visitors.</p>}</div></Card></section>

      <section id="traffic-attribution" className="scroll-mt-24 space-y-4"><div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">Traffic & Attribution</h2><p className="text-sm text-slate-500">Where visitors came from and which campaigns generated orders and revenue.</p></div><Link href="/marketing/integrations" className="text-xs font-bold text-cyan-300">Manage analytics connections →</Link></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Traffic channels</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left py-2">Source / Medium</th><th className="text-right">Sessions</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead><tbody>{traffic.map((r, i) => <tr key={`${r.source}-${r.medium}-${r.campaign}-${i}`} className="border-t border-slate-800"><td className="py-3"><p className="font-bold text-white">{r.source} / {r.medium}</p><p className="text-xs text-slate-500">{r.campaign}</p></td><td className="text-right">{r.sessions.toLocaleString()}</td><td className="text-right">{r.purchases.toLocaleString()}</td><td className="text-right font-bold">{money(r.revenue)}</td></tr>)}</tbody></table></div></Card><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Campaign attribution</h3><div className="space-y-2">{attributionRows.slice(0, 12).map((r, i) => <div key={`${r.source}-${r.medium}-${r.campaign_name}-${i}`} className="p-3 rounded-xl border border-slate-800 bg-slate-950/30 flex justify-between gap-3"><div className="min-w-0"><p className="font-bold text-white truncate">{r.campaign_name || '(not set)'}</p><p className="text-xs text-slate-500">{r.source || 'direct'} / {r.medium || 'none'} • {Number(r.orders || 0)} orders</p></div><div className="text-right"><p className="font-black text-white">{money(Number(r.revenue || 0))}</p><p className="text-xs text-slate-500">Spend {money(Number(r.spend || 0))}</p></div></div>)}{!loading && attributionRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No attributed conversions yet.</p>}</div></Card></div></section>

      <section id="geography" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Geography & Devices</h2><p className="text-sm text-slate-500">Country, city, device and browser dimensions where the connected source supplies them.</p></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{geoGroups.map(group => <Card key={group.label} className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">{group.label}</h3><div className="space-y-2">{group.rows.map(row => <div key={row.label} className="flex justify-between gap-3 border-b border-slate-800/60 pb-2"><span className="text-sm text-slate-300 truncate">{row.label}</span><span className="font-bold text-white">{row.count.toLocaleString()}</span></div>)}{!loading && group.rows.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No dimension data collected yet.</p>}</div></Card>)}</div></section>

      <section id="ecommerce" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Ecommerce & Conversion Analytics</h2><p className="text-sm text-slate-500">Website journey from product view through checkout and purchase.</p></div><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">{[
        ['Users', current.users.toLocaleString()], ['Sessions', current.sessions.toLocaleString()], ['Page views', current.pageViews.toLocaleString()], ['Product views', current.productViews.toLocaleString()], ['Carts', current.carts.toLocaleString()], ['Checkouts', current.checkouts.toLocaleString()], ['Purchases', current.purchases.toLocaleString()], ['Revenue', money(current.revenue)],
      ].map(([label, value]) => <Card key={label} className="p-3 bg-slate-900/40 border-slate-800 rounded-xl"><p className="text-[9px] uppercase tracking-widest text-slate-600">{label}</p><p className="text-sm font-black text-white mt-1">{value}</p></Card>)}</div><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-500">Product → Cart</p><p className="text-2xl font-black text-white">{current.productViews ? ((current.carts / current.productViews) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Cart → Checkout</p><p className="text-2xl font-black text-white">{current.carts ? ((current.checkouts / current.carts) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Checkout → Purchase</p><p className="text-2xl font-black text-white">{current.checkouts ? ((current.purchases / current.checkouts) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Revenue / Order</p><p className="text-2xl font-black text-white">{money(current.purchases ? current.revenue / current.purchases : 0)}</p></div></div></Card></section>

      <section id="search-console" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Google Search Console Analytics</h2><p className="text-sm text-slate-500">Organic search clicks, impressions, CTR, ranking and search queries.</p></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Clicks</p><p className="text-2xl font-black text-white">{searchTotals.clicks.toLocaleString()}</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Impressions</p><p className="text-2xl font-black text-white">{searchTotals.impressions.toLocaleString()}</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">CTR</p><p className="text-2xl font-black text-white">{searchTotals.impressions ? ((searchTotals.clicks / searchTotals.impressions) * 100).toFixed(2) : '0.00'}%</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Avg position</p><p className="text-2xl font-black text-white">{searchTotals.impressions ? (searchTotals.weightedPosition / searchTotals.impressions).toFixed(1) : '—'}</p></Card></div><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Top search queries</h3><div className="space-y-2">{topQueries.map(row => <div key={row.label} className="flex justify-between gap-4 border-b border-slate-800/60 pb-2"><span className="text-sm text-slate-300 truncate">{row.label}</span><span className="text-xs text-slate-500 whitespace-nowrap">{row.clicks} clicks • {row.impressions} impressions</span></div>)}{!loading && topQueries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No Search Console data imported yet.</p>}</div></Card></section>

      <section id="apps" className="scroll-mt-24 space-y-4"><div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">Play Store & App Store Analytics</h2><p className="text-sm text-slate-500">Android/iOS store views, installs, active users, crashes, conversions and growth.</p></div><Link href="/marketing/apps" className="text-xs font-bold text-cyan-300">App management & releases →</Link></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{appSummaries.map(app => <Card key={app.id} className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="flex justify-between gap-3 mb-4"><div><p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">{String(app.platform).toLowerCase().includes('ios') ? 'App Store' : 'Play Store'}</p><h3 className="font-black text-white mt-1">{app.display_name || app.package_identifier}</h3><p className="text-xs text-slate-500">{stores.find(s => s.id === app.store_id)?.name || app.store_id}</p></div><span className="text-xs px-2 py-1 h-fit rounded-lg border border-slate-700 text-slate-400">{app.status}</span></div><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-500">Installs 30d</p><p className="text-xl font-black text-white">{app.metrics.installs.toLocaleString()}</p><p className={`text-xs ${app.installGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{app.installGrowth >= 0 ? '+' : ''}{app.installGrowth.toFixed(1)}%</p></div><div><p className="text-xs text-slate-500">Active users</p><p className="text-xl font-black text-white">{app.metrics.active.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Store views</p><p className="font-bold text-white">{app.metrics.views.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Crashes</p><p className="font-bold text-white">{app.metrics.crashes.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Conversions</p><p className="font-bold text-white">{app.metrics.conversions.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Revenue</p><p className="font-bold text-white">{money(app.metrics.revenue)}</p></div></div></Card>)}</div>{!loading && appSummaries.length === 0 && <Card className="p-8 bg-slate-900/40 border-slate-800 rounded-2xl text-center"><p className="text-sm text-slate-500">No Play Store or App Store analytics imported yet.</p></Card>}</section>

      <section id="health" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Analytics Data Health</h2><p className="text-sm text-slate-500">Confirm sync and ingestion health before relying on a report.</p></div><GA4HealthPanel storeId={selectedStoreId} /><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-500">Website metric rows</p><p className="text-xl font-black text-white">{dailyRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Visitor sessions</p><p className="text-xl font-black text-white">{sessionRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Search rows</p><p className="text-xl font-black text-white">{searchRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">App metric rows</p><p className="text-xl font-black text-white">{appMetrics.length.toLocaleString()}</p></div></div></Card></section>
    </div>
  );
}
