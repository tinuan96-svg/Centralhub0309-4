'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader, StatCard } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';
import { numeric, readReportRows } from '@/lib/dashboard/reporting';
import { DonutChart, EmptyState, MetricBars, Panel } from '@/components/dashboard/Charts';
import { ArrowUpRight, Megaphone, RefreshCw } from 'lucide-react';

export default function MarketingOverviewClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any[] | null>(null);
  const [connections, setConnections] = useState<any[] | null>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [marketingReserve, setMarketingReserve] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const requestId = useRef(0);
  const loadData = useCallback(async (isCurrent: () => boolean = () => true) => {
    const id = ++requestId.current;
    setLoading(true); setErrors([]); setMetrics(null); setConnections(null); setMarketingReserve(null); setLoadedAt(null);
    const scoped = (query: any) => selectedStoreId ? query.eq('store_id', selectedStoreId) : query;
    const results = await Promise.allSettled([
      readReportRows(() => scoped(supabase.from('marketing_metrics').select('id,spend,conversion_value,conversions,impressions,clicks,provider_id').order('id')), 'Advertising metrics'),
      readReportRows(() => scoped(supabase.from('marketing_connections').select('id,store_id,provider_id,status,last_sync_at,provider:marketing_providers(display_name)').order('id')), 'Connection status'),
      supabase.from('v_marketing_reserve_dashboard').select('*').maybeSingle(),
      readReportRows(() => scoped(supabase.from('marketing_insights').select('id,title,description').eq('status', 'new').order('priority', { ascending: false }).order('id')), 'Saved insights'),
    ]);
    if (!isCurrent() || id !== requestId.current) return;
    const failures: string[] = [];
    const read = <T,>(i: number, name: string): T | null => { const r = results[i]; if (r.status === 'rejected' || (r.value && !Array.isArray(r.value) && 'error' in r.value && r.value.error)) { failures.push(name + ' could not be loaded.'); return null; } return r.value as T; };
    setMetrics(read<any[]>(0, 'Advertising metrics')); setConnections(read<any[]>(1, 'Connection status')); setMarketingReserve(read<{ data: any }>(2, 'Marketing reserve')?.data || null); setInsights(read<any[]>(3, 'Saved insights') || []);
    setErrors(failures); setLoadedAt(new Date()); setLoading(false);
  }, [selectedStoreId]);
  useEffect(() => { let current = true; void loadData(() => current); return () => { current = false; requestId.current++; }; }, [loadData]);
  const totals = (metrics || []).reduce((a, r) => ({ spend: a.spend + numeric(r.spend), revenue: a.revenue + numeric(r.conversion_value), conversions: a.conversions + numeric(r.conversions), impressions: a.impressions + numeric(r.impressions), clicks: a.clicks + numeric(r.clicks) }), { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 });
  const byProvider = new Map<string, number>();
  (metrics || []).forEach(r => byProvider.set(r.provider_id || 'Unknown', (byProvider.get(r.provider_id || 'Unknown') || 0) + numeric(r.spend)));
  const hasMetrics = Boolean(metrics?.length);
  const selectedStore = stores.find(s => s.id === selectedStoreId);
  const quickActions = [
    ['Campaigns', '/marketing/campaigns'], ['Integrations', '/marketing/integrations'], ['Tracking', '/marketing/tracking'],
    ['Feeds', '/marketing/product-feeds'], ['Budgets', '/marketing/budgets'], ['Audiences', '/marketing/segments'],
    ['Creative', '/marketing/creative-library'], ['Reports', '/marketing/reports'], ['WhatsApp', '/marketing/whatsapp'],
    ['Email', '/marketing/email'], ['Social', '/marketing/social'], ['AI Marketing', '/marketing/ai'],
  ];
  return <div className="ch-dashboard ch-dashboard-stack">
    <div className="flex flex-wrap items-start justify-between gap-5"><PageHeader title="Marketing performance" subtitle={selectedStore ? selectedStore.name + ' · All imported history' : 'All stores · All imported history'} icon={<Megaphone size={26} />} /><div className="flex flex-wrap items-center gap-3"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /><button type="button" disabled={loading} onClick={() => void loadData()} className="ch-button"><RefreshCw size={16} />Refresh</button></div></div>
    <nav className="ch-tabs flex-wrap" aria-label="Marketing sections">{quickActions.map(([label, href]) => <Link key={href} href={href} className="ch-tab">{label}<ArrowUpRight size={13} /></Link>)}</nav>
    {errors.length > 0 && <div role="alert" className="ch-note ch-error">{errors.join(' ')}</div>}
    {!loading && metrics !== null && !hasMetrics && <div className="ch-note"><strong>No imported advertising metrics yet.</strong> Connect the store's advertising accounts and import their metrics to populate these charts. <Link href="/marketing/integrations" className="ch-link">Manage connections →</Link></div>}
    <div className="ch-kpi-grid">
      <StatCard label="Advertising spend" value={hasMetrics ? formatCurrency(totals.spend) : '—'} description="Imported account totals" />
      <StatCard label="Attributed revenue" value={hasMetrics ? formatCurrency(totals.revenue) : '—'} description="Reported by ad providers" />
      <StatCard label="Return on ad spend" value={hasMetrics && totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) + '×' : '—'} description="Attributed revenue / spend" />
      <StatCard label="Conversions" value={hasMetrics ? totals.conversions.toLocaleString('en-GB') : '—'} description="Reported conversion events" />
      <StatCard label="Click-through rate" value={hasMetrics && totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) + '%' : '—'} description="Clicks / impressions" />
      <StatCard label="Marketing reserve" value={marketingReserve ? formatCurrency(marketingReserve.available_total) : '—'} description="Shared reserve · all stores" />
    </div>
    <div className="ch-grid-main">
      <Panel title="Spend and return" subtitle="Imported GBP amounts; provider attribution can overlap.">{hasMetrics ? <MetricBars data={[{ label: 'Advertising spend', value: totals.spend, color: '#a78bfa' }, { label: 'Attributed revenue', value: totals.revenue, color: '#67e8f9' }]} format={formatCurrency} /> : <EmptyState>{loading ? 'Loading advertising data…' : 'No imported advertising data.'}</EmptyState>}<p className="ch-muted mt-5">Attributed revenue is the amount reported by each advertising platform. Check reconciled sales in Finance before using it as business revenue.</p></Panel>
      <Panel title="Spend by provider" subtitle="Share of imported advertising spend."><DonutChart data={[...byProvider].map(([label, value]) => ({ label, value }))} label="ad spend" format={formatCurrency} /></Panel>
    </div>
    <div className="ch-grid-two">
      <Panel title="Connection status" subtitle="Latest saved status for the selected store." action={<Link href="/marketing/integrations" className="ch-link">Manage connections →</Link>}>
        {connections === null ? <p className="ch-muted">{loading ? 'Loading connections…' : 'Connection status unavailable.'}</p> : connections.length === 0 ? <EmptyState>No advertising connection is recorded for this scope.</EmptyState> : <div className="space-y-4">{connections.map(c => <div key={c.id} className="flex items-start justify-between gap-4 border-b border-slate-700/50 pb-3"><div><p className="ch-panel-title">{(Array.isArray(c.provider) ? c.provider[0]?.display_name : c.provider?.display_name) || c.provider_id}</p><p className="ch-muted">{stores.find(s => s.id === c.store_id)?.name || 'Store'} · {c.last_sync_at ? 'Last sync ' + new Date(c.last_sync_at).toLocaleString('en-GB') : 'No sync recorded'}</p></div><span className="ch-status">{c.status || 'Unknown'}</span></div>)}</div>}
      </Panel>
      <Panel title="Marketing reserve" subtitle="Shared funds from reconciled receipts across all stores." action={<Link href="/finance/reserves" className="ch-link">Reserve controls →</Link>}>
        {marketingReserve ? <><MetricBars data={[{ label: 'Available', value: numeric(marketingReserve.available_total), color: '#6ee7b7' }, { label: 'Allocated this month', value: numeric(marketingReserve.allocated_this_month) }, { label: 'Spent to date', value: numeric(marketingReserve.spent_total), color: '#fbbf24' }]} format={formatCurrency} /><p className="ch-muted mt-5">Allocated to date: {formatCurrency(numeric(marketingReserve.allocated_total))}</p></> : <EmptyState>{loading ? 'Loading reserve…' : 'Reserve data unavailable.'}</EmptyState>}
      </Panel>
    </div>
    <Panel title="Saved marketing insights" action={<Link href="/marketing/ai" className="ch-link">Review marketing →</Link>}>{loading ? <p className="ch-muted">Loading insights…</p> : insights.length === 0 ? <EmptyState>No saved insights for this scope.</EmptyState> : <div className="grid md:grid-cols-2 gap-4">{insights.slice(0, 5).map(i => <div key={i.id}><p className="ch-panel-title">{i.title}</p><p className="ch-muted mt-2">{i.description}</p></div>)}</div>}</Panel>
    <p className="ch-muted text-right">Report {loadedAt ? 'loaded ' + loadedAt.toLocaleString('en-GB') : 'not loaded'}</p>
  </div>;
}
