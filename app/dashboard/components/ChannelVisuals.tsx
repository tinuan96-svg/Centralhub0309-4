'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { readReportRows } from '@/lib/dashboard/reporting';
import { ImportedMetric, metricGroups, metricRate, metricTotal } from '@/lib/dashboard/channelMetrics';
import { formatCurrency } from '@/lib/utils/currency';
import { DonutChart, MetricBars, Panel } from '@/components/dashboard/Charts';
import { GradientRing } from '@/components/dashboard/ReferenceCharts';
import { MetricState, VisualMetric } from '@/components/dashboard/VisualMetric';
import TimeSeriesChart from '@/components/TimeSeriesChart';

type LoadState = { rows: ImportedMetric[]; loading: boolean; error: boolean };
const initial: LoadState = { rows: [], loading: true, error: false };
const figure = (n: number | null, money = false) => n === null ? '—' : money ? formatCurrency(n) : n.toLocaleString('en-GB');
const bars = (rows: { label: string; value: number | null }[]) => rows.filter((row): row is { label: string; value: number } => row.value !== null);
const distribution = (rows: { label: string; value: number | null }[], label: string, format?: (value: number) => string) => {
  const data = bars(rows);
  return data.some(row => row.value < 0) || data.every(row => row.value === 0)
    ? <MetricBars data={data} format={format} />
    : <DonutChart data={data} label={label} format={format} />;
};

export type ChannelVisualKind = 'website-activity' | 'traffic-sources' | 'shopping-activity' | 'advertising-return' | 'advertising-rates' | 'advertising-spend' | 'marketing-reserve';

export const CHANNEL_VISUAL_CARDS: { id: ChannelVisualKind; title: string; description: string }[] = [
  { id: 'website-activity', title: 'Website activity', description: 'Sessions and page views for the selected period' },
  { id: 'traffic-sources', title: 'Traffic sources', description: 'Imported sessions by source' },
  { id: 'shopping-activity', title: 'Shopping activity', description: 'Product views, carts, checkouts and purchases' },
  { id: 'advertising-return', title: 'Advertising return', description: 'Spend, attributed revenue and ROAS' },
  { id: 'advertising-rates', title: 'Advertising rates', description: 'Click-through and conversion rates' },
  { id: 'advertising-spend', title: 'Advertising spend', description: 'Advertising spend by provider' },
  { id: 'marketing-reserve', title: 'Marketing reserve', description: 'Shared marketing reserve funds' },
];

type ChannelVisualContextValue = {
  analytics: LoadState;
  marketing: LoadState;
  reserve: LoadState;
};
const ChannelVisualContext = createContext<ChannelVisualContextValue | null>(null);

export function ChannelVisualsProvider({ start, end, selectedStoreId, refreshKey, children }: { start: string; end: string; selectedStoreId: string; refreshKey: number; children: ReactNode }) {
  const [analytics, setAnalytics] = useState<LoadState>(initial);
  const [marketing, setMarketing] = useState<LoadState>(initial);
  const [reserve, setReserve] = useState<LoadState>(initial);

  useEffect(() => {
    let cancelled = false;
    setAnalytics(state => ({ ...state, loading: true }));
    setMarketing(state => ({ ...state, loading: true }));
    setReserve(state => ({ ...state, loading: true }));
    const scope = (q: any) => selectedStoreId === 'all' ? q : q.eq('store_id', selectedStoreId);
    const tasks = [
      readReportRows<ImportedMetric>(() => scope(supabase.from('analytics_daily_metrics').select('id,metric_date,source,sessions,engaged_sessions,page_views,product_views,add_to_carts,checkouts,purchases').gte('metric_date', start).lte('metric_date', end).order('id')), 'Website metrics'),
      readReportRows<ImportedMetric>(() => scope(supabase.from('marketing_metrics').select('id,provider_id,spend,conversion_value,conversions,impressions,clicks').gte('date', start).lte('date', end).order('id')), 'Advertising metrics'),
      Promise.resolve(supabase.from('v_marketing_reserve_dashboard').select('available_total,allocated_this_month,spent_total').maybeSingle()).then(({ data, error }) => { if (error) throw error; return data ? [data as ImportedMetric] : []; }),
    ];
    const setters = [setAnalytics, setMarketing, setReserve];
    tasks.forEach((task, i) => { void task.then(rows => { if (!cancelled) setters[i]({ rows, loading: false, error: false }); }).catch(() => { if (!cancelled) setters[i]({ rows: [], loading: false, error: true }); }); });
    return () => { cancelled = true; };
  }, [start, end, selectedStoreId, refreshKey]);

  return <ChannelVisualContext.Provider value={{ analytics, marketing, reserve }}>{children}</ChannelVisualContext.Provider>;
}

export function ChannelVisualCard({ kind }: { kind: ChannelVisualKind }) {
  const state = useContext(ChannelVisualContext);
  if (!state) return <Panel title="Channel analytics" subtitle="Dashboard data provider unavailable"><MetricState error label="Analytics unavailable" /></Panel>;
  const { analytics, marketing, reserve } = state;
  const a = (field: string) => metricTotal(analytics.rows, field);
  const m = (field: string) => metricTotal(marketing.rows, field);
  const roas = metricRate(m('conversion_value'), m('spend'), 1);
  const daySessions = metricGroups(analytics.rows, 'metric_date', 'sessions');
  const trendComplete = daySessions.every(row => row.value !== null);
  const traffic = metricGroups(analytics.rows, 'source', 'sessions');
  const spend = metricGroups(marketing.rows, 'provider_id', 'spend');
  const eventValues = ['product_views', 'add_to_carts', 'checkouts', 'purchases'].map(a);
  const returnValues = ['spend', 'conversion_value'].map(m);
  const reserveValues = ['available_total', 'allocated_this_month', 'spent_total'].map(field => metricTotal(reserve.rows, field));
  const unavailable = (load: LoadState) => <MetricState loading={load.loading} error={load.error} label="No imported data" />;

  switch (kind) {
    case 'website-activity':
      return <Panel title="Website activity" subtitle="Imported metrics · selected period">{!analytics.rows.length ? unavailable(analytics) : <><div className="ch-visual-metrics"><VisualMetric label="Sessions" value={figure(a('sessions'))} /><VisualMetric label="Page views" value={figure(a('page_views'))} /></div><div className="ch-model-trend">{trendComplete ? <TimeSeriesChart compact dense unit="count" timeRange="custom" title="Sessions by day" series={[{ id: 'sessions', name: 'Sessions', color: '#50e4eb', data: bars(daySessions).sort((x, y) => x.label.localeCompare(y.label)).map(r => ({ date: r.label, value: r.value })) }]} /> : <MetricState label="Incomplete daily metrics" />}</div></>}</Panel>;
    case 'traffic-sources':
      return <Panel title="Traffic sources" subtitle="Imported sessions · selected period">{!analytics.rows.length ? unavailable(analytics) : traffic.some(r => r.value === null) ? <MetricState label="Incomplete traffic metrics" /> : distribution(traffic, 'sessions')}</Panel>;
    case 'shopping-activity':
      return <Panel title="Shopping activity" subtitle="Recorded events · selected period">{!analytics.rows.length ? unavailable(analytics) : eventValues.some(value => value === null) ? <MetricState label="Incomplete event metrics" /> : <><MetricBars data={bars([{ label: 'Product views', value: a('product_views') }, { label: 'Add to carts', value: a('add_to_carts') }, { label: 'Checkouts', value: a('checkouts') }, { label: 'Purchases', value: a('purchases') }])} /><GradientRing label="Engaged sessions" value={metricRate(a('engaged_sessions'), a('sessions'))} detail={`${figure(a('engaged_sessions'))} / ${figure(a('sessions'))} sessions`} /></>}</Panel>;
    case 'advertising-return':
      return <Panel title="Advertising return" subtitle="Provider attribution · selected period">{!marketing.rows.length ? unavailable(marketing) : <><div className="ch-visual-metrics"><VisualMetric label="ROAS" value={roas === null ? '—' : roas.toFixed(2) + '×'} /><VisualMetric label="Conversions" value={figure(m('conversions'))} /></div>{returnValues.some(value => value === null) ? <MetricState label="Incomplete return metrics" /> : <MetricBars data={bars([{ label: 'Spend', value: m('spend') }, { label: 'Attributed revenue', value: m('conversion_value') }])} format={formatCurrency} />}<span className="ch-model-meta">GBP · Attribution may overlap</span></>}</Panel>;
    case 'advertising-rates':
      return <Panel title="Advertising rates" subtitle="Imported events · selected period">{!marketing.rows.length ? unavailable(marketing) : <div className="ch-visual-ring-pair"><GradientRing label="Click-through" value={metricRate(m('clicks'), m('impressions'))} detail={`${figure(m('clicks'))} clicks / ${figure(m('impressions'))} impressions`} /><GradientRing label="Conversions / clicks" value={metricRate(m('conversions'), m('clicks'))} detail={`${figure(m('conversions'))} / ${figure(m('clicks'))}`} /></div>}</Panel>;
    case 'advertising-spend':
      return <Panel title="Advertising spend" subtitle="By provider · selected period">{!marketing.rows.length ? unavailable(marketing) : spend.some(r => r.value === null) ? <MetricState label="Incomplete spend metrics" /> : distribution(spend, 'ad spend', formatCurrency)}</Panel>;
    case 'marketing-reserve':
      return <Panel title="Marketing reserve" subtitle="Shared funds · all stores">{!reserve.rows.length ? unavailable(reserve) : reserveValues.some(value => value === null) ? <MetricState label="Incomplete reserve metrics" /> : <MetricBars data={bars([{ label: 'Available', value: metricTotal(reserve.rows, 'available_total') }, { label: 'Allocated this month', value: metricTotal(reserve.rows, 'allocated_this_month') }, { label: 'Spent to date', value: metricTotal(reserve.rows, 'spent_total') }])} format={formatCurrency} />}</Panel>;
  }
}

export default function ChannelVisuals(props: { start: string; end: string; selectedStoreId: string; refreshKey: number }) {
  return <ChannelVisualsProvider {...props}>{CHANNEL_VISUAL_CARDS.map(card => <ChannelVisualCard key={card.id} kind={card.id} />)}</ChannelVisualsProvider>;
}
