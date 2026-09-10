'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Activity, Boxes, CircleAlert, Clock3, Database, Globe2, MessageCircle, Radar, RefreshCw, ShieldCheck, ShoppingBag, Truck, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DonutChart, MetricBars, Panel } from '@/components/dashboard/Charts';
import { GradientRing } from '@/components/dashboard/ReferenceCharts';
import { VisualMetric } from '@/components/dashboard/VisualMetric';
import { formatCurrency } from '@/lib/utils/currency';

type ConnectionState = 'connecting' | 'live' | 'polling' | 'offline';
type StorePulse = {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  security_status: string | null;
  latency_ms: number | null;
  http_status: number | null;
  tls_valid: boolean | null;
  security_score: number | null;
  heartbeat_at: string | null;
  site_health_score: number | null;
  site_health_status: string | null;
  site_health_at: string | null;
  orders_24h: number;
  revenue_24h: number;
  active_5m: number;
};
type HourPoint = { at: string; orders?: number; revenue?: number; sessions?: number };
type AlertRow = { source: string; title: string; severity: string; at: string };
type Snapshot = {
  sampled_at: string;
  network: { stores: number; online: number; stale: number; security_index: number | null; site_health_index: number | null };
  stores: StorePulse[];
  commerce: { orders_24h: number; revenue_24h: number; orders_60m: number; revenue_60m: number; average_order_24h: number | null; picking: number; packing: number; dispatch: number; in_delivery: number; delivered: number; hourly: HourPoint[] };
  traffic: { active_5m: number; sessions_60m: number; sessions_24h: number; converted_24h: number; page_views_60m: number; events_60m: number; hourly: HourPoint[] };
  inventory: { total: number; available: number; low: number; zero: number; movements_60m: number };
  sync: { pending: number; failed: number; order_pending: number; order_failed: number; oldest_pending_at: string | null };
  communications: { open: number; human: number; messages_60m: number; inbound_24h: number; outbound_24h: number; failed_24h: number };
  shipping: { shipments_7d: number; in_transit: number; delivered_24h: number; errors_24h: number; cost_verified_7d: number };
  security: { open_24h: number; critical: number; high: number };
  site_health: { open: number; critical: number; high: number };
  alerts: AlertRow[];
};

type MonitorContextValue = {
  snapshot: Snapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  connection: ConnectionState;
  refresh: () => void;
};

export type OperationsWidgetDefinition = {
  id: string;
  title: string;
  description: string;
  desktop: number;
  tablet: number;
  mobile: number;
  minHeight: number;
  content: ReactNode;
};

const MonitorContext = createContext<MonitorContextValue | null>(null);
const realtimeTables = new Set([
  'orders', 'analytics_sessions', 'products', 'inventory_movements', 'sync_queue', 'order_sync_queue',
  'whatsapp_conversations', 'whatsapp_messages', 'shipments', 'security_events', 'security_heartbeats',
  'site_health_issues', 'site_health_runs',
]);

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const maybeNumber = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const percent = (n: number, d: number) => d > 0 ? n / d * 100 : null;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function useMonitor() {
  const value = useContext(MonitorContext);
  if (!value) throw new Error('Operations monitor widget must be rendered inside OperationsMonitorProvider.');
  return value;
}

function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function age(value: string | null | undefined, now = Date.now()) {
  if (!value) return 'No sample';
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortMoney(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function LoadingPanel({ title }: { title: string }) {
  return <Panel title={title} subtitle="Connecting to live operational telemetry"><div className="h-44 animate-pulse rounded-2xl bg-slate-800/30" /></Panel>;
}

function MiniLine({ points, dataKey, label, money = false }: { points: HourPoint[]; dataKey: 'revenue' | 'sessions' | 'orders'; label: string; money?: boolean }) {
  const values = points.map(point => number(point[dataKey]));
  if (!values.length) return <div className="ch-empty">No 24-hour samples yet.</div>;
  const width = 320, height = 90, pad = 8;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + index / (values.length - 1) * (width - pad * 2);
    const y = height - pad - (value - min) / range * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const latest = values[values.length - 1];
  const peak = Math.max(...values);
  return <div className="mt-5 rounded-2xl border border-slate-700/40 bg-slate-950/20 p-3">
    <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-slate-400">{label}</span><span className="font-semibold text-slate-200">now {money ? shortMoney(latest) : latest.toLocaleString('en-GB')} · peak {money ? shortMoney(peak) : peak.toLocaleString('en-GB')}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" role="img" aria-label={`${label}. Latest ${latest}; peak ${peak}.`}>
      <defs><linearGradient id={`mini-${dataKey}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".35" /><stop offset="100%" stopColor="#22d3ee" stopOpacity=".02" /></linearGradient></defs>
      <line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} stroke="#334155" strokeWidth="1" />
      <polygon points={`${pad},${height-pad} ${coords} ${width-pad},${height-pad}`} fill={`url(#mini-${dataKey})`} />
      <polyline points={coords} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((value, index) => { const [x, y] = coords.split(' ')[index].split(','); return <circle key={index} cx={x} cy={y} r={index === values.length - 1 ? 3.5 : 1.5} fill={index === values.length - 1 ? '#67e8f9' : '#22d3ee'}><title>{new Date(points[index].at).toLocaleString('en-GB')} · {money ? formatCurrency(value) : value.toLocaleString('en-GB')}</title></circle>; })}
    </svg>
    <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-500"><span>−24h</span><span>live</span></div>
  </div>;
}

function connectionBadge(connection: ConnectionState, refreshing: boolean) {
  const label = refreshing ? 'sampling' : connection;
  const tone = connection === 'live' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : connection === 'offline' ? 'border-rose-400/30 bg-rose-400/10 text-rose-200' : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200';
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${connection === 'live' ? 'bg-emerald-300 animate-pulse' : connection === 'offline' ? 'bg-rose-300' : 'bg-cyan-300 animate-pulse'}`} />{label}</span>;
}

export function OperationsMonitorProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    setRefreshing(true);
    try {
      const { data, error: queryError } = await supabase.rpc('get_live_operations_snapshot');
      if (queryError) throw queryError;
      if (data && typeof data === 'object') setSnapshot(data as Snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live operations snapshot could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 350);
    };
    const channel = supabase.channel(`operations-monitor-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        if (realtimeTables.has(payload.table)) refreshSoon();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection(navigator.onLine ? 'polling' : 'offline');
        else setConnection(navigator.onLine ? 'connecting' : 'offline');
      });

    const onOnline = () => { setConnection('connecting'); void load(); };
    const onOffline = () => setConnection('offline');
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const fallback = window.setInterval(() => void load(), 30_000);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.clearInterval(fallback);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const value = useMemo(() => ({ snapshot, loading, refreshing, error, connection, refresh: () => void load() }), [snapshot, loading, refreshing, error, connection, load]);
  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>;
}

function CommandCentrePanel() {
  const { snapshot, loading, refreshing, error, connection, refresh } = useMonitor();
  const now = useClock();
  if (!snapshot && loading) return <LoadingPanel title="24×7 Operations Command Centre" />;
  if (!snapshot) return <Panel title="24×7 Operations Command Centre" subtitle="CentralHub operational telemetry unavailable"><div className="ch-metric-state" role="alert"><WifiOff size={26} /><span>{error || 'No live snapshot available.'}</span></div></Panel>;

  const syncIssues = number(snapshot.sync.pending) + number(snapshot.sync.failed) + number(snapshot.sync.order_pending) + number(snapshot.sync.order_failed);
  const syncScore = clamp(100 - (number(snapshot.sync.failed) + number(snapshot.sync.order_failed)) * 30 - (number(snapshot.sync.pending) + number(snapshot.sync.order_pending)) * 5);
  const messageScore = snapshot.communications.outbound_24h > 0 ? clamp(100 - snapshot.communications.failed_24h / snapshot.communications.outbound_24h * 100) : null;
  const stockScore = percent(snapshot.inventory.available, snapshot.inventory.total);
  const indexParts = [maybeNumber(snapshot.network.security_index), maybeNumber(snapshot.network.site_health_index), syncScore, messageScore, stockScore].filter((value): value is number => value !== null);
  const opsIndex = indexParts.length ? Math.round(indexParts.reduce((sum, value) => sum + value, 0) / indexParts.length) : null;
  const sampledAge = now - new Date(snapshot.sampled_at).getTime();
  const coreStatus = connection === 'offline' ? 'offline' : sampledAge > 90_000 ? 'degraded' : 'online';
  const nodeTone = (status: string | null) => status === 'online' ? 'bg-emerald-400' : status === 'offline' ? 'bg-rose-400' : status === 'stale' ? 'bg-slate-500' : 'bg-amber-400';

  return <Panel title="24×7 Operations Command Centre" subtitle="CentralHub core + every visible storefront · realtime events with 30-second verification" action={<div className="flex items-center gap-2">{connectionBadge(connection, refreshing)}<button type="button" onClick={refresh} className="ch-button ch-console-icon" title="Sample live operations now"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button></div>}>
    <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
      <div className="rounded-3xl border border-cyan-400/10 bg-slate-950/25 p-4">
        <div className="flex items-center gap-3"><div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10"><Radar size={23} className="text-cyan-200" /><span className="absolute inset-0 rounded-full border border-cyan-300/30 animate-ping" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ops index</p><p className="text-3xl font-semibold text-white">{opsIndex == null ? '—' : `${opsIndex}%`}</p></div></div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">Rule-based composite of live security, site-health, sync, message-delivery and stock-availability signals.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-900/60 p-2"><span className="text-slate-500">Nodes</span><strong className="mt-1 block text-slate-100">{snapshot.network.stores + 1}</strong></div><div className="rounded-xl bg-slate-900/60 p-2"><span className="text-slate-500">Signals</span><strong className="mt-1 block text-slate-100">{snapshot.security.open_24h + snapshot.site_health.open + syncIssues}</strong></div><div className="rounded-xl bg-slate-900/60 p-2"><span className="text-slate-500">Security</span><strong className="mt-1 block text-slate-100">{snapshot.network.security_index == null ? '—' : `${snapshot.network.security_index}%`}</strong></div><div className="rounded-xl bg-slate-900/60 p-2"><span className="text-slate-500">Sample</span><strong className="mt-1 block text-slate-100">{age(snapshot.sampled_at, now)}</strong></div></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-950/20 p-3"><div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-sm font-semibold text-white"><Database size={15} /> CentralHub Core</span><span className={`h-2.5 w-2.5 rounded-full ${nodeTone(coreStatus)} ${coreStatus === 'online' ? 'animate-pulse' : ''}`} /></div><p className="mt-3 text-xs text-slate-400">Data plane {connection} · snapshot {age(snapshot.sampled_at, now)}</p><div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">Sync issues</span><strong className={syncIssues ? 'text-amber-200' : 'text-emerald-200'}>{syncIssues}</strong></div></div>
        {snapshot.stores.map(store => <div key={store.id} className="rounded-2xl border border-slate-700/50 bg-slate-950/20 p-3"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-white">{store.name}</span><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${nodeTone(store.security_status)} ${store.security_status === 'online' ? 'animate-pulse' : ''}`} /></div><p className="mt-1 truncate text-[11px] text-slate-500">{store.domain || store.slug || 'storefront'}</p><div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs"><span className="text-slate-500">Latency</span><strong className="text-right text-slate-200">{store.latency_ms == null ? '—' : `${store.latency_ms}ms`}</strong><span className="text-slate-500">Security</span><strong className="text-right text-slate-200">{store.security_score == null ? '—' : `${store.security_score}%`}</strong><span className="text-slate-500">24h orders</span><strong className="text-right text-slate-200">{number(store.orders_24h)}</strong><span className="text-slate-500">Active</span><strong className="text-right text-slate-200">{number(store.active_5m)}</strong></div><p className="mt-2 text-[10px] uppercase tracking-wider text-slate-600">heartbeat {age(store.heartbeat_at, now)}</p></div>)}
      </div>
    </div>
    {error && <div className="ch-note ch-error mt-4"><CircleAlert size={15} /> Refresh delayed; the last verified snapshot is still displayed.</div>}
  </Panel>;
}

function CommercePanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Live commerce" /> : <Panel title="Live commerce"><div className="ch-empty">No commerce telemetry.</div></Panel>;
  const c = snapshot.commerce;
  return <Panel title="Live commerce" subtitle="Payment-received activity · rolling 24 hours" action={<span className="ch-status">LIVE</span>}>
    <div className="ch-visual-metrics"><VisualMetric label="Revenue · 24h" value={formatCurrency(number(c.revenue_24h))} /><VisualMetric label="Paid orders · 24h" value={number(c.orders_24h)} /><VisualMetric label="Orders · 60m" value={number(c.orders_60m)} /><VisualMetric label="Average order" value={c.average_order_24h == null ? '—' : formatCurrency(number(c.average_order_24h))} /></div>
    <MiniLine points={c.hourly || []} dataKey="revenue" label="Paid revenue per hour" money />
  </Panel>;
}

function TrafficPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Traffic pulse" /> : <Panel title="Traffic pulse"><div className="ch-empty">No traffic telemetry.</div></Panel>;
  const t = snapshot.traffic;
  const conversion = percent(t.converted_24h, t.sessions_24h);
  return <Panel title="Traffic pulse" subtitle="First-party CentralHub analytics · rolling 24 hours" action={<span className="ch-status">5m active</span>}>
    <div className="ch-visual-metrics"><VisualMetric label="Active now" value={number(t.active_5m)} detail="Seen in last 5 min" /><VisualMetric label="Sessions · 60m" value={number(t.sessions_60m)} /><VisualMetric label="Page views · 60m" value={number(t.page_views_60m)} /><VisualMetric label="Conversion · 24h" value={conversion == null ? '—' : `${conversion.toFixed(1)}%`} /></div>
    <MiniLine points={t.hourly || []} dataKey="sessions" label="Sessions per hour" />
  </Panel>;
}

function SyncPanel() {
  const { snapshot, loading } = useMonitor();
  const now = useClock();
  if (!snapshot) return loading ? <LoadingPanel title="Sync mesh" /> : <Panel title="Sync mesh"><div className="ch-empty">No sync telemetry.</div></Panel>;
  const s = snapshot.sync;
  const failures = number(s.failed) + number(s.order_failed);
  const pending = number(s.pending) + number(s.order_pending);
  const score = clamp(100 - failures * 30 - pending * 5);
  return <Panel title="Sync mesh" subtitle="CentralHub ↔ storefront operational queues" action={<span className={`ch-status ${failures ? 'text-rose-300' : pending ? 'text-amber-300' : 'text-emerald-300'}`}>{failures ? 'errors' : pending ? 'queued' : 'clear'}</span>}>
    <div className="ch-visual-ring-pair"><GradientRing label="Sync health" value={score} detail={`${pending} queued · ${failures} failed`} /><div className="ch-visual-metrics ch-visual-metrics-column"><VisualMetric label="Core queue" value={number(s.pending)} /><VisualMetric label="Order queue" value={number(s.order_pending)} /><VisualMetric label="Failures" value={failures} /><VisualMetric label="Oldest queued" value={s.oldest_pending_at ? age(s.oldest_pending_at, now) : 'None'} /></div></div>
  </Panel>;
}

function InventoryPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Inventory radar" /> : <Panel title="Inventory radar"><div className="ch-empty">No inventory telemetry.</div></Panel>;
  const i = snapshot.inventory;
  return <Panel title="Inventory radar" subtitle="Current active catalogue · shared warehouse" action={<span className="ch-status">{number(i.movements_60m)} moves / 60m</span>}>
    <DonutChart label="products" data={[{ label: 'Available', value: number(i.available), color: '#22d3ee' }, { label: 'Low stock', value: number(i.low), color: '#fbbf24' }, { label: 'Zero / negative', value: number(i.zero), color: '#f04fed' }]} />
  </Panel>;
}

function FulfilmentPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Fulfilment control" /> : <Panel title="Fulfilment control"><div className="ch-empty">No fulfilment telemetry.</div></Panel>;
  const c = snapshot.commerce;
  return <Panel title="Fulfilment control" subtitle="Paid orders created in the last 24 hours" action={<span className="ch-status">flow</span>}>
    <MetricBars data={[{ label: 'Picking', value: number(c.picking) }, { label: 'Packing', value: number(c.packing) }, { label: 'Ready / dispatch', value: number(c.dispatch) }, { label: 'In delivery', value: number(c.in_delivery) }, { label: 'Delivered', value: number(c.delivered) }]} />
  </Panel>;
}

function CustomerOpsPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Customer ops" /> : <Panel title="Customer ops"><div className="ch-empty">No communications telemetry.</div></Panel>;
  const c = snapshot.communications;
  return <Panel title="Customer ops" subtitle="Unified inbox and message delivery · live" action={<span className={c.failed_24h ? 'ch-status text-rose-300' : 'ch-status text-emerald-300'}>{c.failed_24h ? `${c.failed_24h} failed` : 'delivery clear'}</span>}>
    <div className="ch-visual-metrics"><VisualMetric label="Open conversations" value={number(c.open)} /><VisualMetric label="With admin" value={number(c.human)} /><VisualMetric label="Messages · 60m" value={number(c.messages_60m)} /><VisualMetric label="Failed · 24h" value={number(c.failed_24h)} /></div>
    <div className="mt-5"><DonutChart label="messages / 24h" data={[{ label: 'Inbound', value: number(c.inbound_24h), color: '#22d3ee' }, { label: 'Outbound', value: number(c.outbound_24h), color: '#a78bfa' }]} /></div>
  </Panel>;
}

function ShippingPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Shipping control" /> : <Panel title="Shipping control"><div className="ch-empty">No shipping telemetry.</div></Panel>;
  const s = snapshot.shipping;
  const coverage = percent(s.cost_verified_7d, s.shipments_7d);
  return <Panel title="Shipping control" subtitle="Shipment and tracking telemetry · rolling 7 days" action={<span className={s.errors_24h ? 'ch-status text-rose-300' : 'ch-status text-emerald-300'}>{s.errors_24h ? 'attention' : 'tracking clear'}</span>}>
    <div className="ch-visual-metrics"><VisualMetric label="Shipments · 7d" value={number(s.shipments_7d)} /><VisualMetric label="In transit" value={number(s.in_transit)} /><VisualMetric label="Delivered · 24h" value={number(s.delivered_24h)} /><VisualMetric label="Tracking errors · 24h" value={number(s.errors_24h)} /></div>
    <div className="mt-5"><GradientRing label="Actual cost coverage" value={coverage} detail={`${number(s.cost_verified_7d)} / ${number(s.shipments_7d)} recent shipments`} /></div>
  </Panel>;
}

function SiteHealthPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Site health matrix" /> : <Panel title="Site health matrix"><div className="ch-empty">No site-health telemetry.</div></Panel>;
  return <Panel title="Site health matrix" subtitle="Security heartbeats + latest site audits" action={<span className={snapshot.site_health.critical ? 'ch-status text-rose-300' : snapshot.site_health.high ? 'ch-status text-amber-300' : 'ch-status text-emerald-300'}>{snapshot.site_health.open} open</span>}>
    <div className="ch-visual-ring-pair"><GradientRing label="Security index" value={maybeNumber(snapshot.network.security_index)} detail={`${snapshot.network.online}/${snapshot.network.stores} stores fully online`} /><GradientRing label="Site-health index" value={maybeNumber(snapshot.network.site_health_index)} detail={`${snapshot.site_health.high} high · ${snapshot.site_health.critical} critical issues`} /></div>
  </Panel>;
}

function StoreScoreboardPanel() {
  const { snapshot, loading } = useMonitor();
  if (!snapshot) return loading ? <LoadingPanel title="Store scoreboard" /> : <Panel title="Store scoreboard"><div className="ch-empty">No store telemetry.</div></Panel>;
  return <Panel title="Store scoreboard" subtitle="All visible storefronts · rolling 24 hours" action={<span className="ch-status">{snapshot.stores.length} stores</span>}>
    <MetricBars data={snapshot.stores.map(store => ({ label: store.name, value: number(store.revenue_24h) }))} format={formatCurrency} />
    <div className="mt-5 space-y-2">{snapshot.stores.map(store => <div key={store.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-950/20 px-3 py-2 text-xs"><span className="truncate text-slate-300">{store.name}</span><span className="text-slate-500">security <b className="text-slate-200">{store.security_score == null ? '—' : `${store.security_score}%`}</b></span><span className="text-slate-500">active <b className="text-slate-200">{number(store.active_5m)}</b></span></div>)}</div>
  </Panel>;
}

function AlertStreamPanel() {
  const { snapshot, loading } = useMonitor();
  const now = useClock();
  if (!snapshot) return loading ? <LoadingPanel title="Live signal stream" /> : <Panel title="Live signal stream"><div className="ch-empty">No alert telemetry.</div></Panel>;
  const severityTone = (severity: string) => severity === 'critical' ? 'bg-rose-400' : severity === 'high' ? 'bg-orange-400' : severity === 'medium' ? 'bg-amber-400' : 'bg-cyan-400';
  return <Panel title="Live signal stream" subtitle="Security, site-health and sync signals · newest first" action={<span className="ch-status">{snapshot.alerts.length} recent</span>}>
    {!snapshot.alerts.length ? <div className="ch-empty">No active signals.</div> : <div className="space-y-2">{snapshot.alerts.slice(0, 10).map((alert, index) => <div key={`${alert.source}-${alert.at}-${index}`} className="grid grid-cols-[10px_1fr_auto] items-start gap-3 rounded-xl border border-slate-800/60 bg-slate-950/20 px-3 py-2.5"><span className={`mt-1.5 h-2 w-2 rounded-full ${severityTone(alert.severity)}`} /><div className="min-w-0"><p className="truncate text-sm text-slate-200">{alert.title}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{alert.source.replace(/_/g, ' ')} · {alert.severity}</p></div><time className="whitespace-nowrap text-[11px] text-slate-500">{age(alert.at, now)}</time></div>)}</div>}
  </Panel>;
}

export function getOperationsMonitorWidgets(): OperationsWidgetDefinition[] {
  const small = { desktop: 4, tablet: 6, mobile: 12, minHeight: 300 };
  return [
    { id: 'operations-command-centre', title: '24×7 command centre', description: 'Live CentralHub core and all-store operating status', desktop: 12, tablet: 12, mobile: 12, minHeight: 350, content: <CommandCentrePanel /> },
    { id: 'live-commerce', title: 'Live commerce', description: 'Paid revenue and orders in rolling live windows', ...small, minHeight: 360, content: <CommercePanel /> },
    { id: 'traffic-pulse', title: 'Traffic pulse', description: 'Active visitors, sessions, page activity and conversion', ...small, minHeight: 360, content: <TrafficPanel /> },
    { id: 'sync-mesh', title: 'Sync mesh', description: 'CentralHub and storefront synchronization queues', ...small, content: <SyncPanel /> },
    { id: 'inventory-radar', title: 'Inventory radar', description: 'Current warehouse stock risk and live movements', ...small, content: <InventoryPanel /> },
    { id: 'fulfilment-control', title: 'Fulfilment control', description: 'Rolling paid-order flow through operational stages', ...small, content: <FulfilmentPanel /> },
    { id: 'customer-ops-live', title: 'Customer ops', description: 'Open conversations and message-delivery health', ...small, content: <CustomerOpsPanel /> },
    { id: 'shipping-control-live', title: 'Shipping control', description: 'Shipment, tracking and actual-cost coverage', ...small, content: <ShippingPanel /> },
    { id: 'site-health-matrix', title: 'Site health matrix', description: 'Security and technical health indexes for all stores', ...small, content: <SiteHealthPanel /> },
    { id: 'store-scoreboard-live', title: 'Store scoreboard', description: 'Per-store sales, security and active visitor signals', ...small, content: <StoreScoreboardPanel /> },
    { id: 'live-signal-stream', title: 'Live signal stream', description: 'Newest security, site-health and sync alerts', desktop: 8, tablet: 12, mobile: 12, minHeight: 360, content: <AlertStreamPanel /> },
  ];
}
