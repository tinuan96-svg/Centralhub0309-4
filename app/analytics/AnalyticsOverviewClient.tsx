'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, StatCard } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import GA4HealthPanel from './GA4HealthPanel';
import GA4RealtimePanel from './GA4RealtimePanel';
import { analyticsService } from '@/lib/services/analytics/analyticsService';
import { supabase } from '@/lib/supabase';
import type { AnalyticsRealtimeStore } from '@/lib/types/analytics';

const daysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const pct = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
const money = (value: number) => `£${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

type DailySummary = { users: number; sessions: number; pageViews: number; productViews: number; carts: number; checkouts: number; purchases: number; revenue: number };
const emptyDaily = (): DailySummary => ({ users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
const sumDaily = (rows: any[]): DailySummary => rows.reduce((a, r) => ({
  users: a.users + Number(r.users || 0), sessions: a.sessions + Number(r.sessions || 0), pageViews: a.pageViews + Number(r.page_views || 0), productViews: a.productViews + Number(r.product_views || 0), carts: a.carts + Number(r.add_to_carts || 0), checkouts: a.checkouts + Number(r.checkouts || 0), purchases: a.purchases + Number(r.purchases || 0), revenue: a.revenue + Number(r.revenue || 0),
}), emptyDaily());

function topGrouped(rows: any[], keyOf: (row: any) => string, limit = 10) {
  const map = new Map<string, { label: string; count: number; sessions: number; revenue: number }>();
  for (const row of rows) {
    const label = keyOf(row) || 'Unknown';
    const cur = map.get(label) || { label, count: 0, sessions: 0, revenue: 0 };
    cur.count += 1;
    cur.sessions += Number(row.sessions || 0);
    cur.revenue += Number(row.revenue || 0);
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => (b.sessions || b.count) - (a.sessions || a.count)).slice(0, limit);
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
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from60 = daysAgo(60);
    const from30 = daysAgo(30);

    let dailyQuery = supabase.from('analytics_daily_metrics').select('store_id,metric_date,source,medium,campaign,users,sessions,engaged_sessions,page_views,product_views,add_to_carts,checkouts,purchases,revenue').gte('metric_date', from60).order('metric_date', { ascending: true }).limit(5000);
    let sessionQuery = supabase.from('analytics_sessions').select('store_id,session_key,anonymous_id,source,medium,campaign,country,region,city,device_category,browser,operating_system,started_at,last_seen_at,page_count,event_count,engaged,converted').gte('started_at', `${from30}T00:00:00Z`).order('started_at', { ascending: false }).limit(5000);
    let attributionQuery = supabase.from('analytics_campaign_attribution').select('store_id,source,medium,campaign_name,visitors,sessions,product_views,add_to_carts,checkouts,orders,revenue,spend,updated_at').order('updated_at', { ascending: false }).limit(2000);
    let searchQuery = supabase.from('search_console_daily_metrics').select('store_id,metric_date,query,page,country,device,clicks,impressions,ctr,position').gte('metric_date', from30).order('metric_date', { ascending: false }).limit(5000);
    let appsQuery = supabase.from('app_marketing_apps').select('id,store_id,platform,package_identifier,display_name,external_app_id,status,metadata').order('display_name').limit(200);

    if (selectedStoreId) {
      dailyQuery = dailyQuery.eq('store_id', selectedStoreId);
      sessionQuery = sessionQuery.eq('store_id', selectedStoreId);
      attributionQuery = attributionQuery.eq('store_id', selectedStoreId);
      searchQuery = searchQuery.eq('store_id', selectedStoreId);
      appsQuery = appsQuery.eq('store_id', selectedStoreId);
    }

    const tasks: Array<[string, PromiseLike<any>]> = [
      ['Realtime', analyticsService.getRealtime(selectedStoreId || undefined)],
      ['Active visitors', analyticsService.getActiveVisitors(selectedStoreId || undefined)],
      ['Website trends', dailyQuery],
      ['Visitor dimensions', sessionQuery],
      ['Attribution', attributionQuery],
      ['Search Console', searchQuery],
      ['Apps', appsQuery],
      ['App metrics', supabase.from('app_marketing_daily_metrics').select('app_id,metric_date,impressions,product_page_views,downloads,installs,active_users,crashes,conversions,spend,revenue,currency').gte('metric_date', from60).order('metric_date', { ascending: false }).limit(5000)],
    ];

    const settled = await Promise.allSettled(tasks.map(([, promise]) => promise));
    const nextErrors: string[] = [];
    const value = (index: number) => {
      const result = settled[index];
      if (result.status === 'rejected') { nextErrors.push(`${tasks[index][0]}: ${String(result.reason?.message || result.reason || 'failed')}`); return []; }
      const payload = result.value;
      if (payload?.error) { nextErrors.push(`${tasks[index][0]}: ${payload.error.message || 'failed'}`); return []; }
      return Array.isArray(payload) ? payload : payload?.data || [];
    };

    setRealtime(value(0));
    setActiveVisitors(value(1));
    setDailyRows(value(2));
    setSessionRows(value(3));
    setAttributionRows(value(4));
    setSearchRows(value(5));
    const appRows = value(6);
    setApps(appRows);
    const visibleAppIds = new Set(appRows.map((a: any) => a.id));
    setAppMetrics(value(7).filter((m: any) => visibleAppIds.has(m.app_id)));
    setErrors(nextErrors);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [load]);

  const totals = realtime.reduce((a, r) => ({
    users: a.users + Number(r.active_users || 0), sessions: a.sessions + Number(r.active_sessions || 0), pages: a.pages + Number(r.page_views || 0), products: a.products + Number(r.product_views || 0), carts: a.carts + Number(r.add_to_carts || 0), checkouts: a.checkouts + Number(r.checkout_users || 0),
  }), { users: 0, sessions: 0, pages: 0, products: 0, carts: 0, checkouts: 0 });

  const current30 = useMemo(() => dailyRows.filter(r => String(r.metric_date) >= daysAgo(30)), [dailyRows]);
  const previous30 = useMemo(() => dailyRows.filter(r => String(r.metric_date) >= daysAgo(60) && String(r.metric_date) < daysAgo(30)), [dailyRows]);
  const current = useMemo(() => sumDaily(current30), [current30]);
  const previous = useMemo(() => sumDaily(previous30), [previous30]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const row of current30) {
      const key = String(row.metric_date);
      const cur = map.get(key) || emptyDaily();
      cur.users += Number(row.users || 0); cur.sessions += Number(row.sessions || 0); cur.pageViews += Number(row.page_views || 0); cur.productViews += Number(row.product_views || 0); cur.carts += Number(row.add_to_carts || 0); cur.checkouts += Number(row.checkouts || 0); cur.purchases += Number(row.purchases || 0); cur.revenue += Number(row.revenue || 0);
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [current30]);

  const traffic = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of current30) {
      const source = r.source || '(direct)', medium = r.medium || '(none)', campaign = r.campaign || '(not set)';
      const key = `${source}|${medium}|${campaign}`;
      const cur = map.get(key) || { source, medium, campaign, users: 0, sessions: 0, purchases: 0, revenue: 0 };
      cur.users += Number(r.users || 0); cur.sessions += Number(r.sessions || 0); cur.purchases += Number(r.purchases || 0); cur.revenue += Number(r.revenue || 0);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 15);
  }, [current30]);

  const countryRows = useMemo(() => topGrouped(sessionRows.filter(r => r.country), r => r.country, 12), [sessionRows]);
  const cityRows = useMemo(() => topGrouped(sessionRows.filter(r => r.city), r => r.city, 12), [sessionRows]);
  const deviceRows = useMemo(() => topGrouped(sessionRows.filter(r => r.device_category), r => r.device_category, 10), [sessionRows]);
  const browserRows = useMemo(() => topGrouped(sessionRows.filter(r => r.browser), r => r.browser, 10), [sessionRows]);

  const searchTotals = useMemo(() => searchRows.reduce((a, r) => ({ clicks: a.clicks + Number(r.clicks || 0), impressions: a.impressions + Number(r.impressions || 0), posWeighted: a.posWeighted + Number(r.position || 0) * Number(r.impressions || 0) }), { clicks: 0, impressions: 0, posWeighted: 0 }), [searchRows]);
  const topQueries = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of searchRows) { if (!r.query) continue; const cur = map.get(r.query) || { label: r.query, clicks: 0, impressions: 0 }; cur.clicks += Number(r.clicks || 0); cur.impressions += Number(r.impressions || 0); map.set(r.query, cur); }
    return [...map.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 12);
  }, [searchRows]);
  const topSearchCountries = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of searchRows) if (r.country) map.set(r.country, (map.get(r.country) || 0) + Number(r.clicks || 0));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [searchRows]);

  const appSummaries = useMemo(() => apps.map(app => {
    const rows = appMetrics.filter(m => m.app_id === app.id);
    const nowRows = rows.filter(r => String(r.metric_date) >= daysAgo(30));
    const prevRows = rows.filter(r => String(r.metric_date) >= daysAgo(60) && String(r.metric_date) < daysAgo(30));
    const sum = (list: any[]) => list.reduce((a, r) => ({ impressions: a.impressions + Number(r.impressions || 0), pageViews: a.pageViews + Number(r.product_page_views || 0), downloads: a.downloads + Number(r.downloads || 0), installs: a.installs + Number(r.installs || 0), active: a.active + Number(r.active_users || 0), crashes: a.crashes + Number(r.crashes || 0), conversions: a.conversions + Number(r.conversions || 0), spend: a.spend + Number(r.spend || 0), revenue: a.revenue + Number(r.revenue || 0) }), { impressions: 0, pageViews: 0, downloads: 0, installs: 0, active: 0, crashes: 0, conversions: 0, spend: 0, revenue: 0 });
    const currentApp = sum(nowRows), previousApp = sum(prevRows);
    return { ...app, metrics: currentApp, installGrowth: pct(currentApp.installs, previousApp.installs) };
  }).sort((a, b) => b.metrics.installs - a.metrics.installs), [apps, appMetrics]);

  const analyticsStore = selectedStoreId ? stores.find(s => s.id === selectedStoreId) : null;

  return (
    <div className="p-4 md:p-6 space-y-8 pb-32 max-w-[1600px] mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <PageHeader title="Analytics Centre" subtitle={analyticsStore ? `All website, customer, search and app analytics for ${analyticsStore.name}` : 'All website, customer, search and app analytics across CentralHub stores'} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div>
          <button onClick={() => void load()} className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white font-bold">{loading ? 'Refreshing…' : 'Refresh all'}</button>
        </div>
      </div>

      <Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`} className="whitespace-nowrap px-3 py-2 rounded-xl border border-slate-800 bg-slate-950/60 text-xs font-bold text-slate-300 hover:text-white hover:border-cyan-500/40">{label}</a>)}
        </div>
      </Card>

      {errors.length > 0 && <Card className="p-4 bg-amber-500/5 border-amber-500/20 rounded-2xl"><p className="text-sm font-bold text-amber-300">Some analytics sources are not ready yet.</p><p className="text-xs text-amber-200/70 mt-1">{errors.join(' • ')}</p></Card>}

      <section id="overview" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-xl font-black text-white">Overview</h2><p className="text-sm text-slate-500">Live activity plus the latest 30-day website performance.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"><StatCard label="Visitors Now" value={totals.users.toLocaleString()} icon="👥" variant="glass" /><StatCard label="Sessions Now" value={totals.sessions.toLocaleString()} icon="⚡" variant="glass" /><StatCard label="30d Users" value={current.users.toLocaleString()} icon="📈" variant="glass" /><StatCard label="30d Orders" value={current.purchases.toLocaleString()} icon="🛒" variant="glass" /><StatCard label="30d Revenue" value={money(current.revenue)} icon="💎" variant="glass" /><StatCard label="Search Clicks" value={searchTotals.clicks.toLocaleString()} icon="🔎" variant="glass" /></div>
      </section>

      <section id="growth" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-xl font-black text-white">Growth & Trends</h2><p className="text-sm text-slate-500">Latest 30 days compared with the preceding 30 days.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
          ['Users', current.users, pct(current.users, previous.users)], ['Sessions', current.sessions, pct(current.sessions, previous.sessions)], ['Orders', current.purchases, pct(current.purchases, previous.purchases)], ['Revenue', money(current.revenue), pct(current.revenue, previous.revenue)],
        ].map(([label, value, change]) => <Card key={String(label)} className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p><p className="text-2xl font-black text-white mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p><p className={`text-xs mt-1 font-bold ${Number(change) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number(change) >= 0 ? '+' : ''}{Number(change).toFixed(1)}% vs previous 30d</p></Card>)}</div>
        <Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left py-2">Date</th><th className="text-right">Users</th><th className="text-right">Sessions</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead><tbody>{dailyTrend.map(([date, row]) => <tr key={date} className="border-t border-slate-800"><td className="py-3 text-slate-300">{date}</td><td className="text-right">{row.users.toLocaleString()}</td><td className="text-right">{row.sessions.toLocaleString()}</td><td className="text-right">{row.purchases.toLocaleString()}</td><td className="text-right font-bold text-white">{money(row.revenue)}</td></tr>)}</tbody></table>{!loading && dailyTrend.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No historical website metrics have been imported yet.</p>}</div></Card>
      </section>

      <section id="website-ga4" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Website & Google Analytics 4</h2><p className="text-sm text-slate-500">GA4 configuration, imported metrics and property health for each store.</p></div><GA4HealthPanel storeId={selectedStoreId} /></section>

      <section id="realtime" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Realtime Visitors</h2><p className="text-sm text-slate-500">GA4 realtime and CentralHub live event mirror.</p></div><GA4RealtimePanel storeId={selectedStoreId} /><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Visitors</th><th>Sessions</th><th>Page views</th><th>Products</th><th>Carts</th><th>Top source</th><th>Top page</th></tr></thead><tbody>{realtime.map(row => { const store = stores.find(s => s.id === row.store_id); return <tr key={row.store_id} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{store?.name || row.store_id}</td><td>{row.active_users}</td><td>{row.active_sessions}</td><td>{row.page_views}</td><td>{row.product_views}</td><td>{row.add_to_carts}</td><td>{row.top_source || '—'}</td><td className="max-w-[260px] truncate">{row.top_page || '—'}</td></tr>; })}</tbody></table>{!loading && realtime.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No realtime events available yet.</p>}</div></Card></section>

      <section id="visitors" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Visitor Tracking</h2><p className="text-sm text-slate-500">Privacy-safe active sessions, current pages, sources and campaigns.</p></div><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="flex items-center justify-between mb-4"><span className="text-xs text-slate-500">Active = heartbeat within last 5 minutes</span><span className="text-xs text-cyan-300 font-bold">{activeVisitors.length} active</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="py-3">Store</th><th>Source</th><th>Campaign</th><th>Current page</th><th>Product</th><th>Last seen</th></tr></thead><tbody>{activeVisitors.map((v, i) => { const store = stores.find(s => s.id === v.store_id); return <tr key={`${v.store_id}-${v.session_key}-${i}`} className="border-t border-slate-800"><td className="py-4 font-bold text-white">{store?.name || v.store_id}</td><td>{v.source || 'direct'} / {v.medium || 'none'}</td><td>{v.campaign || '—'}</td><td className="max-w-[280px] truncate">{v.current_page_title || v.current_page || '—'}</td><td className="max-w-[220px] truncate">{v.current_product || '—'}</td><td>{Number(v.seconds_since_seen || 0)}s ago</td></tr>; })}</tbody></table>{!loading && activeVisitors.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No visitors active in the last 5 minutes.</p>}</div></Card></section>

      <section id="traffic-attribution" className="scroll-mt-24 space-y-4"><div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">Traffic & Attribution</h2><p className="text-sm text-slate-500">Sources, mediums, campaigns and converted revenue.</p></div><Link href="/marketing/integrations" className="text-xs font-bold text-cyan-300">Manage analytics connections →</Link></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Top traffic sources</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left py-2">Source / Medium</th><th className="text-right">Sessions</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead><tbody>{traffic.map((r, i) => <tr key={`${r.source}-${r.medium}-${r.campaign}-${i}`} className="border-t border-slate-800"><td className="py-3"><p className="font-bold text-white">{r.source} / {r.medium}</p><p className="text-xs text-slate-500">{r.campaign}</p></td><td className="text-right">{r.sessions.toLocaleString()}</td><td className="text-right">{r.purchases.toLocaleString()}</td><td className="text-right font-bold">{money(r.revenue)}</td></tr>)}</tbody></table>{!loading && traffic.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No channel analytics yet.</p>}</div></Card><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Campaign attribution</h3><div className="space-y-2">{attributionRows.slice(0, 12).map((r, i) => <div key={`${r.source}-${r.medium}-${r.campaign_name}-${i}`} className="p-3 rounded-xl border border-slate-800 bg-slate-950/30 flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold text-white truncate">{r.campaign_name || '(not set)'}</p><p className="text-xs text-slate-500">{r.source || 'direct'} / {r.medium || 'none'} • {Number(r.orders || 0)} orders</p></div><div className="text-right"><p className="font-black text-white">{money(Number(r.revenue || 0))}</p><p className="text-xs text-slate-500">Spend {money(Number(r.spend || 0))}</p></div></div>)}{!loading && attributionRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No attributed conversions yet.</p>}</div></Card></div></section>

      <section id="geography" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Geography & Devices</h2><p className="text-sm text-slate-500">Country, city, device and browser dimensions from available visitor/session data.</p></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{[
        ['Countries', countryRows], ['Cities', cityRows], ['Devices', deviceRows], ['Browsers', browserRows],
      ].map(([label, rows]) => <Card key={String(label)} className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">{label}</h3><div className="space-y-2">{(rows as any[]).map((r, i) => <div key={`${r.label}-${i}`} className="flex items-center justify-between text-sm border-b border-slate-800/60 pb-2"><span className="text-slate-300 truncate pr-3">{r.label}</span><span className="font-bold text-white">{r.count.toLocaleString()}</span></div>)}{!loading && (rows as any[]).length === 0 && <p className="py-6 text-center text-xs text-slate-500">No dimension data collected yet.</p>}</div></Card>)}</div></section>

      <section id="ecommerce" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Ecommerce & Conversion Analytics</h2><p className="text-sm text-slate-500">Website journey from product view to purchase.</p></div><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">{[['Users', current.users], ['Sessions', current.sessions], ['Page views', current.pageViews], ['Product views', current.productViews], ['Carts', current.carts], ['Checkouts', current.checkouts], ['Purchases', current.purchases], ['Revenue', money(current.revenue)]].map(([label, value]) => <Card key={String(label)} className="p-3 bg-slate-900/40 border-slate-800 rounded-xl"><p className="text-[9px] uppercase tracking-widest text-slate-600">{label}</p><p className="text-sm font-black text-white mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p></Card>)}</div><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-500">Product → Cart</p><p className="text-2xl font-black text-white">{current.productViews > 0 ? ((current.carts / current.productViews) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Cart → Checkout</p><p className="text-2xl font-black text-white">{current.carts > 0 ? ((current.checkouts / current.carts) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Checkout → Purchase</p><p className="text-2xl font-black text-white">{current.checkouts > 0 ? ((current.purchases / current.checkouts) * 100).toFixed(1) : '0.0'}%</p></div><div><p className="text-xs text-slate-500">Revenue / Order</p><p className="text-2xl font-black text-white">{current.purchases > 0 ? money(current.revenue / current.purchases) : money(0)}</p></div></div></Card></section>

      <section id="search-console" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Google Search Console Analytics</h2><p className="text-sm text-slate-500">Organic search clicks, impressions, queries, countries and devices.</p></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Clicks</p><p className="text-2xl font-black text-white">{searchTotals.clicks.toLocaleString()}</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Impressions</p><p className="text-2xl font-black text-white">{searchTotals.impressions.toLocaleString()}</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">CTR</p><p className="text-2xl font-black text-white">{searchTotals.impressions > 0 ? ((searchTotals.clicks / searchTotals.impressions) * 100).toFixed(2) : '0.00'}%</p></Card><Card className="p-4 bg-slate-900/40 border-slate-800 rounded-2xl"><p className="text-xs text-slate-500">Avg position</p><p className="text-2xl font-black text-white">{searchTotals.impressions > 0 ? (searchTotals.posWeighted / searchTotals.impressions).toFixed(1) : '—'}</p></Card></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Top search queries</h3><div className="space-y-2">{topQueries.map((r, i) => <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-2"><span className="text-sm text-slate-300 truncate">{r.label}</span><span className="text-xs text-slate-500 whitespace-nowrap">{r.clicks} clicks • {r.impressions} imp.</span></div>)}{!loading && topQueries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No Search Console data imported yet.</p>}</div></Card><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><h3 className="font-black text-white mb-3">Search geography</h3><div className="space-y-2">{topSearchCountries.map(([country, clicks]) => <div key={country} className="flex items-center justify-between border-b border-slate-800/60 pb-2"><span className="text-sm text-slate-300">{country}</span><span className="font-bold text-white">{Number(clicks).toLocaleString()} clicks</span></div>)}{!loading && topSearchCountries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No geographic search data yet.</p>}</div></Card></div></section>

      <section id="apps" className="scroll-mt-24 space-y-4"><div className="flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h2 className="text-xl font-black text-white">Play Store & App Store Analytics</h2><p className="text-sm text-slate-500">Android and iOS impressions, downloads, installs, active users, crashes and conversions.</p></div><Link href="/marketing/apps" className="text-xs font-bold text-cyan-300">App management & releases →</Link></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{appSummaries.map(app => { const store = stores.find(s => s.id === app.store_id); const platformLabel = String(app.platform).toLowerCase().includes('ios') ? 'App Store' : 'Play Store'; return <Card key={app.id} className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="flex items-start justify-between gap-3 mb-4"><div><p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">{platformLabel}</p><h3 className="font-black text-white mt-1">{app.display_name || app.package_identifier}</h3><p className="text-xs text-slate-500">{store?.name || app.store_id}</p></div><span className="text-xs px-2 py-1 rounded-lg border border-slate-700 text-slate-400">{app.status}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500 text-xs">Installs 30d</p><p className="text-xl font-black text-white">{app.metrics.installs.toLocaleString()}</p><p className={`text-xs ${app.installGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{app.installGrowth >= 0 ? '+' : ''}{app.installGrowth.toFixed(1)}%</p></div><div><p className="text-slate-500 text-xs">Active users</p><p className="text-xl font-black text-white">{app.metrics.active.toLocaleString()}</p></div><div><p className="text-slate-500 text-xs">Store views</p><p className="font-bold text-white">{app.metrics.pageViews.toLocaleString()}</p></div><div><p className="text-slate-500 text-xs">Crashes</p><p className="font-bold text-white">{app.metrics.crashes.toLocaleString()}</p></div><div><p className="text-slate-500 text-xs">Conversions</p><p className="font-bold text-white">{app.metrics.conversions.toLocaleString()}</p></div><div><p className="text-slate-500 text-xs">Revenue</p><p className="font-bold text-white">{money(app.metrics.revenue)}</p></div></div></Card>; })}</div>{!loading && appSummaries.length === 0 && <Card className="p-8 bg-slate-900/40 border-slate-800 rounded-2xl text-center"><p className="text-sm text-slate-500">No Play Store or App Store analytics have been imported yet.</p></Card>}</section>

      <section id="health" className="scroll-mt-24 space-y-4"><div><h2 className="text-xl font-black text-white">Analytics Data Health</h2><p className="text-sm text-slate-500">Use this area to confirm GA4 sync, realtime ingestion and reconciliation before trusting a report.</p></div><GA4HealthPanel storeId={selectedStoreId} /><Card className="p-5 bg-slate-900/40 border-slate-800 rounded-2xl"><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-500">Website metric rows</p><p className="text-xl font-black text-white">{dailyRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Visitor sessions</p><p className="text-xl font-black text-white">{sessionRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">Search rows</p><p className="text-xl font-black text-white">{searchRows.length.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">App metric rows</p><p className="text-xl font-black text-white">{appMetrics.length.toLocaleString()}</p></div></div></Card></section>
    </div>
  );
}
