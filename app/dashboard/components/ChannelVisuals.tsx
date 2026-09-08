'use client';

import { useEffect, useState } from 'react';
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
  // A composition ring cannot represent signed corrections or a measured zero total.
  return data.some(row => row.value < 0) || data.every(row => row.value === 0)
    ? <MetricBars data={data} format={format} />
    : <DonutChart data={data} label={label} format={format} />;
};

export default function ChannelVisuals({ start, end, selectedStoreId, refreshKey }: { start: string; end: string; selectedStoreId: string; refreshKey: number }) {
  const [analytics, setAnalytics] = useState<LoadState>(initial);
  const [marketing, setMarketing] = useState<LoadState>(initial);
  const [reserve, setReserve] = useState<LoadState>(initial);
  useEffect(() => {
    let cancelled = false;
    setAnalytics(initial); setMarketing(initial); setReserve(initial);
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
  const unavailable = (state: LoadState) => <MetricState loading={state.loading} error={state.error} label="No imported data" />;
  return <>
    <Panel title="Website activity" subtitle="Imported metrics · selected period">
      {analytics.loading || !analytics.rows.length ? unavailable(analytics) : <><div className="ch-visual-metrics"><VisualMetric label="Sessions" value={figure(a('sessions'))} /><VisualMetric label="Page views" value={figure(a('page_views'))} /></div><div className="ch-model-trend">{trendComplete ? <TimeSeriesChart compact unit="count" timeRange="custom" title="Sessions by day" series={[{ id: 'sessions', name: 'Sessions', color: '#50e4eb', data: bars(daySessions).sort((a, b) => a.label.localeCompare(b.label)).map(r => ({ date: r.label, value: r.value })) }]} /> : <MetricState label="Incomplete daily metrics" />}</div></>}
    </Panel>
    <Panel title="Traffic sources" subtitle="Imported sessions · selected period">{analytics.loading || !analytics.rows.length ? unavailable(analytics) : traffic.some(r => r.value === null) ? <MetricState label="Incomplete traffic metrics" /> : distribution(traffic, 'sessions')}</Panel>
    <Panel title="Shopping activity" subtitle="Recorded events · selected period">
      {analytics.loading || !analytics.rows.length ? unavailable(analytics) : eventValues.some(value => value === null) ? <MetricState label="Incomplete event metrics" /> : <><MetricBars data={bars([{ label: 'Product views', value: a('product_views') }, { label: 'Add to carts', value: a('add_to_carts') }, { label: 'Checkouts', value: a('checkouts') }, { label: 'Purchases', value: a('purchases') }])} /><GradientRing label="Engaged sessions" value={metricRate(a('engaged_sessions'), a('sessions'))} detail={`${figure(a('engaged_sessions'))} / ${figure(a('sessions'))} sessions`} /></>}
    </Panel>
    <Panel title="Advertising return" subtitle="Provider attribution · selected period">
      {marketing.loading || !marketing.rows.length ? unavailable(marketing) : <><div className="ch-visual-metrics"><VisualMetric label="ROAS" value={roas === null ? '—' : roas.toFixed(2) + '×'} /><VisualMetric label="Conversions" value={figure(m('conversions'))} /></div>{returnValues.some(value => value === null) ? <MetricState label="Incomplete return metrics" /> : <MetricBars data={bars([{ label: 'Spend', value: m('spend') }, { label: 'Attributed revenue', value: m('conversion_value') }])} format={formatCurrency} />}<span className="ch-model-meta">GBP · Attribution may overlap</span></>}
    </Panel>
    <Panel title="Advertising rates" subtitle="Imported events · selected period">
      {marketing.loading || !marketing.rows.length ? unavailable(marketing) : <><div className="ch-visual-ring-pair"><GradientRing label="Click-through" value={metricRate(m('clicks'), m('impressions'))} detail={`${figure(m('clicks'))} clicks / ${figure(m('impressions'))} impressions`} /><GradientRing label="Conversions / clicks" value={metricRate(m('conversions'), m('clicks'))} detail={`${figure(m('conversions'))} / ${figure(m('clicks'))}`} /></div></>}
    </Panel>
    <Panel title="Advertising spend" subtitle="By provider · selected period">{marketing.loading || !marketing.rows.length ? unavailable(marketing) : spend.some(r => r.value === null) ? <MetricState label="Incomplete spend metrics" /> : distribution(spend, 'ad spend', formatCurrency)}</Panel>
    <Panel title="Marketing reserve" subtitle="Shared funds · all stores">{reserve.loading || !reserve.rows.length ? unavailable(reserve) : reserveValues.some(value => value === null) ? <MetricState label="Incomplete reserve metrics" /> : <MetricBars data={bars([{ label: 'Available', value: metricTotal(reserve.rows, 'available_total') }, { label: 'Allocated this month', value: metricTotal(reserve.rows, 'allocated_this_month') }, { label: 'Spent to date', value: metricTotal(reserve.rows, 'spent_total') }])} format={formatCurrency} />}</Panel>
  </>;
}
