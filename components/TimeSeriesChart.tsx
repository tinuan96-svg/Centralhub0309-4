'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EmptyState, Panel } from './dashboard/Charts';

export interface ChartSeries { id: string; name: string; color: string; data: { date: string; value: number }[]; }
interface TimeSeriesChartProps { series: ChartSeries[]; timeRange: string; title?: string; unit?: 'GBP' | 'count'; subtitle?: string; compact?: boolean; dense?: boolean; }

export default function TimeSeriesChart({ series, timeRange, title = 'Revenue per store', unit = 'GBP', subtitle, compact = false, dense = false }: TimeSeriesChartProps) {
  const uid = useId().replace(/:/g, '');
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(660);
  useEffect(() => {
    if (!compact || !chartRef.current) return;
    const element = chartRef.current;
    const update = () => setChartWidth(Math.max(280, element.clientWidth));
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, [compact, series]);
  const width = compact ? chartWidth : 660;
  const height = compact && dense ? 194 : 258;
  const bottom = height - 38;
  const plotWidth = width - 100;
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const clean = useMemo(() => series.map(s => ({ ...s, data: s.data.filter(d => Number.isFinite(d.value) && !Number.isNaN(Date.parse(d.date))) })), [series]);
  const dates = useMemo(() => Array.from(new Set(clean.flatMap(s => s.data.map(d => d.date)))).sort(), [clean]);
  const active = clean.filter(s => !hidden.includes(s.id));
  const index = selected && dates.includes(selected) ? dates.indexOf(selected) : Math.max(0, dates.length - 1);
  const format = (n: number) => new Intl.NumberFormat('en-GB', unit === 'GBP' ? { style: 'currency', currency: 'GBP' } : { maximumFractionDigits: 0 }).format(n);
  const compactNumber = (n: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1, ...(unit === 'GBP' ? { style: 'currency', currency: 'GBP' } : {}) }).format(n);
  const dateLabel = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const values = active.flatMap(s => s.data.map(d => d.value));
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const range = high - low;
  const x = (i: number) => dates.length === 1 ? 66 + plotWidth / 2 : 66 + i / (dates.length - 1) * plotWidth;
  const y = (v: number) => bottom - (v - low) / range * (bottom - 35);
  const valueAt = (s: ChartSeries, d: string) => s.data.find(p => p.date === d)?.value;
  const step = Math.max(1, Math.ceil(dates.length / (width < 440 ? 3 : 5)));
  return <Panel className={compact ? 'ch-chart-compact' : ''} title={title} subtitle={subtitle} action={<span className="ch-status">{unit === 'GBP' ? 'GBP' : 'Count'} · {timeRange === 'custom' ? 'Selected dates' : timeRange}</span>}>
    <div className="flex flex-wrap gap-2 mb-4">{clean.map(s => <button type="button" key={s.id} aria-pressed={!hidden.includes(s.id)} onClick={() => setHidden(h => h.includes(s.id) ? h.filter(id => id !== s.id) : active.length > 1 ? [...h, s.id] : h)} className={'ch-button ' + (hidden.includes(s.id) ? 'opacity-50' : '')}><span className="ch-dot" style={{ background: s.color }} />{s.name}</button>)}</div>
    {!dates.length ? <EmptyState>No trend data for this selection.</EmptyState> : <>
      <div ref={chartRef} className="ch-chart-scroll" tabIndex={0} role="region" aria-label={title + ' chart. Scroll horizontally on small screens.'}><svg viewBox={`0 0 ${width} ${height}`} className="ch-chart" role="img" aria-label={title + '. ' + dates.length + ' dates. Exact values are in the table below.'} onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - rect.left) / rect.width * width; const i = dates.length === 1 ? 0 : Math.max(0, Math.min(dates.length - 1, Math.round((px - 66) / plotWidth * (dates.length - 1)))); setSelected(dates[i]); }}>
        <defs>{active.map((s, i) => <linearGradient key={s.id} id={uid + '-' + i} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".25" /><stop offset="100%" stopColor={s.color} stopOpacity=".02" /></linearGradient>)}</defs>
        {Array.from({ length: 5 }, (_, i) => { const val = low + i / 4 * range; return <g key={i}><line x1="66" x2={width - 34} y1={y(val)} y2={y(val)} stroke="#303956" strokeDasharray="3 5" /><text x="55" y={y(val) + 4} textAnchor="end" fill="#a0acc7" fontSize="12">{compactNumber(val)}</text></g>; })}
        {active.map((s, si) => { const points = dates.map((d, i) => ({ i, value: valueAt(s, d) })).filter(p => p.value !== undefined); const line = points.map(p => x(p.i) + ',' + y(p.value!)).join(' '); return <g key={s.id}>{points.length > 1 && <><polygon points={x(points[0].i) + ',' + y(0) + ' ' + line + ' ' + x(points[points.length - 1].i) + ',' + y(0)} fill={'url(#' + uid + '-' + si + ')'} /><polyline points={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" /></>}{points.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.value!)} r={p.i === index || dates.length === 1 ? 4.5 : 2} fill={s.color}><title>{dateLabel(dates[p.i]) + ': ' + s.name + ' ' + format(p.value!)}</title></circle>)}</g>; })}
        <line x1={x(index)} x2={x(index)} y1="25" y2={bottom + 5} stroke="#c4b5fd" strokeOpacity=".35" strokeDasharray="4 4" />
        {dates.map((d, i) => (i % step === 0 || i === dates.length - 1) && <text key={d} x={x(i)} y={height - 8} textAnchor="middle" fill="#a0acc7" fontSize="12">{dateLabel(d)}</text>)}
      </svg></div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 ch-muted" aria-live="polite"><strong className="text-white">{dateLabel(dates[index])}</strong>{active.map(s => { const value = valueAt(s, dates[index]); return <span key={s.id}><span style={{ color: s.color }}>{s.name}</span> <span className="ch-number">{value === undefined ? '—' : format(value)}</span></span>; })}</div>
      {dates.length > 1 && <input type="range" min="0" max={dates.length - 1} value={index} onChange={e => setSelected(dates[Number(e.target.value)])} aria-label={'Inspect date in ' + title} aria-valuetext={dateLabel(dates[index])} className="w-full mt-3 accent-violet-400 h-8" />}
      <details className="ch-chart-details"><summary>View exact values</summary><div className="ch-chart-scroll"><table className="ch-data-table"><caption className="sr-only">{title}</caption><thead><tr><th>Date (UTC)</th>{active.map(s => <th key={s.id}>{s.name}</th>)}</tr></thead><tbody>{dates.map(d => <tr key={d}><td>{dateLabel(d)}</td>{active.map(s => { const value = valueAt(s, d); return <td key={s.id}>{value === undefined ? '—' : format(value)}</td>; })}</tr>)}</tbody></table></div></details>
    </>}
  </Panel>;
}
