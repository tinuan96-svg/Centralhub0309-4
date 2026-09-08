'use client';

import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import { EmptyState } from './Charts';

export const MODEL_COLORS = ['#39e6ef', '#ea41ef', '#a58bff', '#4b91ff', '#74ecc9'];
const readablePercent = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : value.toFixed(1) + '%';

export function GradientRing({ value, label, detail, segmented = false }: { value: number | null; label: string; detail: string; segmented?: boolean }) {
  const id = 'ring-' + useId().replace(/:/g, '');
  const valid = value !== null && Number.isFinite(value) ? value : null;
  const arc = valid === null ? 0 : Math.max(0, Math.min(100, valid));
  return <div className={'ch-model-ring ' + (segmented ? 'ch-model-ring-segmented' : '')}>
    <span className="ch-model-label">{label}</span>
    <svg viewBox="0 0 180 180" role="img" aria-label={label + ': ' + readablePercent(valid)}>
      <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#2997ff" /><stop offset="45%" stopColor="#874cff" /><stop offset="100%" stopColor="#ff42ec" /></linearGradient></defs>
      {segmented ? Array.from({ length: 80 }, (_, i) => {
        const a = (i / 80 * 360 - 90) * Math.PI / 180;
        return <line key={i} x1={90 + Math.cos(a) * 54} y1={90 + Math.sin(a) * 54} x2={90 + Math.cos(a) * 78} y2={90 + Math.sin(a) * 78} stroke={i < arc / 100 * 80 ? `url(#${id})` : 'var(--model-track)'} strokeWidth="3.7" />;
      }) : <><circle cx="90" cy="90" r="66" fill="none" stroke="var(--model-track)" strokeWidth="17" /><circle cx="90" cy="90" r="66" fill="none" pathLength="100" stroke={`url(#${id})`} strokeWidth="17" strokeDasharray={`${arc} 100`} transform="rotate(-90 90 90)" /></>}
      <text x="90" y="99" textAnchor="middle" fill="var(--model-text)" fontSize="29" fontWeight="550">{readablePercent(valid)}</text>
    </svg>
    <span className="ch-model-meta">{detail}</span>
  </div>;
}

export type RateAxis = { label: string; value: number | null; detail: string };
export function HealthRadar({ axes }: { axes: RateAxis[] }) {
  const id = 'radar-' + useId().replace(/:/g, '');
  const point = (index: number, radius: number) => {
    const angle = index / axes.length * Math.PI * 2 - Math.PI / 2;
    return [150 + Math.cos(angle) * radius, 142 + Math.sin(angle) * radius];
  };
  const known = axes.length >= 3 && axes.every(a => a.value !== null && Number.isFinite(a.value));
  const polygon = (radius: number) => axes.map((_, i) => point(i, radius).join(',')).join(' ');
  return <div className="ch-model-radar">
    {known ? <svg viewBox="0 0 300 274" role="img" aria-label={'Operating ratios. ' + axes.map(a => a.label + ' ' + readablePercent(a.value)).join(', ')}>
      <defs><radialGradient id={id}><stop stopColor="#fc4cec" stopOpacity=".9" /><stop offset="100%" stopColor="#a352ed" stopOpacity=".35" /></radialGradient></defs>
      {[22, 44, 66, 88].map(radius => <circle key={radius} cx="150" cy="142" r={radius} fill="none" stroke="var(--model-grid)" />)}
      <polygon points={polygon(88)} fill="none" stroke="var(--model-grid)" />
      {axes.map((a, i) => { const p = point(i, 88); const label = point(i, 110); return <g key={a.label}><line x1="150" y1="142" x2={p[0]} y2={p[1]} stroke="var(--model-grid)" /><text x={label[0]} y={label[1] + 4} textAnchor="middle" fontSize="16" fill="var(--model-muted)">{a.label}</text></g>; })}
      <polygon points={axes.map((a, i) => point(i, Math.max(0, Math.min(100, a.value!)) / 100 * 88).join(',')).join(' ')} fill={`url(#${id})`} stroke="#e995fa" strokeWidth="2" />
      {axes.map((a, i) => { const p = point(i, Math.max(0, Math.min(100, a.value!)) / 100 * 88); return <circle key={a.label} cx={p[0]} cy={p[1]} r="3" fill="#55e5ec"><title>{a.label + ': ' + readablePercent(a.value)}</title></circle>; })}
    </svg> : <EmptyState>More data is needed for a complete operating profile.</EmptyState>}
    <details className="ch-model-details"><summary>Operating ratios</summary><dl>{axes.map(a => <div key={a.label}><dt>{a.label} · {a.detail}</dt><dd>{readablePercent(a.value)}</dd></div>)}</dl><p className="ch-model-meta">Each axis runs from 0 to 100%. Stock is the current shared warehouse; other ratios use this reporting period.</p></details>
  </div>;
}

export type StorePoint = { id: string; name: string; revenue: number; margin: number | null; estimated: boolean };
export function StoreScatter({ stores }: { stores: StorePoint[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const id = 'scatter-' + useId().replace(/:/g, '');
  const points = stores.filter(s => s.margin !== null && Number.isFinite(s.margin) && Number.isFinite(s.revenue));
  const minX = Math.min(0, ...points.map(s => s.revenue));
  const maxX = Math.max(1, ...points.map(s => s.revenue));
  const minY = Math.min(0, ...points.map(s => s.margin!));
  const maxY = Math.max(100, ...points.map(s => s.margin!));
  const x = (value: number) => 58 + (value - minX) / (maxX - minX) * 240;
  const y = (value: number) => 188 - (value - minY) / (maxY - minY) * 154;
  const active = points.find(s => s.id === selected) || points[0];
  const compact = (v: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 }).format(v);
  return <div className="ch-model-scatter">
    {points.length ? <><svg viewBox="0 0 336 242" role="img" aria-label="Store product sales against order gross margin. Values follow below.">
      <defs>{points.map((s, i) => <radialGradient key={s.id} id={id + i}><stop stopColor={MODEL_COLORS[i % MODEL_COLORS.length]} stopOpacity=".8" /><stop offset="100%" stopColor={MODEL_COLORS[i % MODEL_COLORS.length]} stopOpacity="0" /></radialGradient>)}</defs>
      {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="58" x2="298" y1={34 + i * 38.5} y2={34 + i * 38.5} stroke="var(--model-grid)" /><line x1={58 + i * 60} x2={58 + i * 60} y1="34" y2="188" stroke="var(--model-grid)" /><text x="49" y={38 + i * 38.5} textAnchor="end" fontSize="13" fill="var(--model-muted)">{(maxY - i / 4 * (maxY - minY)).toFixed(0)}%</text>{i % 2 === 0 && <text x={58 + i * 60} y="209" textAnchor="middle" fontSize="13" fill="var(--model-muted)">{compact(minX + i / 4 * (maxX - minX))}</text>}</g>)}
      <text x="58" y="17" fontSize="14" fill="var(--model-muted)">Order gross margin</text><text x="178" y="236" textAnchor="middle" fontSize="14" fill="var(--model-muted)">Product sales · GBP</text>
      {points.map((s, i) => <g key={s.id}><circle cx={x(s.revenue)} cy={y(s.margin!)} r="20" fill={`url(#${id}${i})`} /><circle cx={x(s.revenue)} cy={y(s.margin!)} r={active?.id === s.id ? 5 : 3.5} fill={MODEL_COLORS[i % MODEL_COLORS.length]} stroke="var(--model-text)" strokeWidth="1"><title>{`${s.name}: ${formatCurrency(s.revenue)}, ${readablePercent(s.margin)}${s.estimated ? ', estimated product costs' : ''}`}</title></circle></g>)}
    </svg><div className="ch-model-store-choices">{points.map((s, i) => <button type="button" key={s.id} aria-pressed={active.id === s.id} onClick={() => setSelected(s.id)}><i style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />{s.name}</button>)}</div><p className="ch-model-meta">{active.name}: {formatCurrency(active.revenue)} · {readablePercent(active.margin)}{active.estimated ? ' · Estimated costs' : ''}</p></> : <EmptyState>No stores with complete sales and cost data for this period.</EmptyState>}
    {stores.length > points.length && <p className="ch-model-meta">{stores.length - points.length} stores excluded: no paid order total or incomplete costs.</p>}
  </div>;
}

export type DailySeries = { id: string; name: string; values: { date: string; value: number }[] };
export function WeeklyColumns({ series, dates }: { series: DailySeries[]; dates: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected && dates.includes(selected) ? selected : dates[dates.length - 1];
  const values = new Map(series.map(s => [s.id, new Map(s.values.map(d => [d.date, d.value]))]));
  const all = series.flatMap(s => dates.map(d => values.get(s.id)?.get(d) || 0));
  const low = Math.min(0, ...all), high = Math.max(1, ...all);
  const y = (v: number) => (high - v) / (high - low) * 100;
  const total = all.reduce((a, b) => a + b, 0);
  return <div className="ch-model-week">
    <div className="ch-model-week-heading"><span className="ch-model-meta">Last {dates.length} days in this selection</span><strong>{formatCurrency(total)}</strong></div>
    <div className="ch-model-week-legend">{series.map((s, i) => <span key={s.id}><i style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />{s.name}</span>)}</div>
    {!dates.length || !series.length ? <EmptyState>No daily sales in this selection.</EmptyState> : <>
      <div className="ch-model-columns">{dates.map(date => {
        const dayTotal = series.reduce((sum, s) => sum + (values.get(s.id)?.get(date) || 0), 0);
        return <button key={date} type="button" aria-pressed={active === date} aria-label={new Date(date).toLocaleDateString('en-GB', { timeZone: 'UTC' }) + ': ' + formatCurrency(dayTotal)} onClick={() => setSelected(date)}>
          <span className="ch-model-column-top">{new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(dayTotal)}</span>
          <span className="ch-model-column-group" aria-hidden="true"><span className="ch-model-zero" style={{ top: y(0) + '%' }} />{series.map((s, i) => { const value = values.get(s.id)?.get(date) || 0; return <i key={s.id} style={{ top: Math.min(y(value), y(0)) + '%', height: Math.abs(y(value) - y(0)) + '%', background: `linear-gradient(0deg, ${MODEL_COLORS[i % MODEL_COLORS.length]}, ${MODEL_COLORS[i % MODEL_COLORS.length]}55)` }} />; })}</span>
          <span className="ch-model-column-day">{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
        </button>;
      })}</div>
      <p className="ch-model-meta">{new Date(active).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {series.map(s => s.name + ' ' + formatCurrency(values.get(s.id)?.get(active) || 0)).join(' · ')}</p>
      <details className="ch-model-details"><summary>View daily figures</summary><div className="ch-chart-scroll"><table className="ch-data-table"><thead><tr><th>Date (UTC)</th>{series.map(s => <th key={s.id}>{s.name}</th>)}</tr></thead><tbody>{dates.map(d => <tr key={d}><td>{d}</td>{series.map(s => <td key={s.id}>{formatCurrency(values.get(s.id)?.get(d) || 0)}</td>)}</tr>)}</tbody></table></div></details>
    </>}
  </div>;
}

export function ActivityCalendar({ days, start, end }: { days: { date: string; count: number; revenue: number }[]; start: string; end: string }) {
  const [month, setMonth] = useState(end.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const currentMonth = month < start.slice(0, 7) || month > end.slice(0, 7) ? end.slice(0, 7) : month;
  const first = new Date(currentMonth + '-01T00:00:00Z');
  const leading = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const records = new Map(days.map(d => [d.date, d]));
  const highest = Math.max(1, ...days.filter(d => d.date.startsWith(currentMonth)).map(d => d.count));
  const shift = (by: number) => { const date = new Date(first); date.setUTCMonth(date.getUTCMonth() + by); setMonth(date.toISOString().slice(0, 7)); setSelected(null); };
  const chosen = selected && selected.startsWith(currentMonth) ? selected : end.startsWith(currentMonth) ? end : currentMonth + '-01' < start ? start : currentMonth + '-01';
  const count = records.get(chosen)?.count || 0;
  return <div className="ch-model-calendar">
    <div className="ch-model-calendar-heading"><button type="button" onClick={() => shift(-1)} disabled={currentMonth <= start.slice(0, 7)} aria-label="Previous month"><ChevronLeft size={17} /></button><strong>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button type="button" onClick={() => shift(1)} disabled={currentMonth >= end.slice(0, 7)} aria-label="Next month"><ChevronRight size={17} /></button></div>
    <div className="ch-model-calendar-grid">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <span key={day} className="ch-model-calendar-day">{day}</span>)}{Array.from({ length: leading }, (_, i) => <span key={'blank' + i} />)}{Array.from({ length }, (_, i) => {
      const date = currentMonth + '-' + String(i + 1).padStart(2, '0');
      const available = date >= start && date <= end;
      const record = records.get(date);
      const level = !record?.count ? 0 : Math.min(4, Math.ceil(record.count / highest * 4));
      return <button type="button" key={date} disabled={!available} data-level={level} aria-pressed={chosen === date && available} onClick={() => setSelected(date)} aria-label={date + (available ? ': ' + (record?.count || 0) + ' paid orders, ' + formatCurrency(record?.revenue || 0) : ': outside reporting period')}>{i + 1}</button>;
    })}</div>
    <p className="ch-model-meta">{chosen} · {count} paid orders · {formatCurrency(records.get(chosen)?.revenue || 0)}</p>
    <div className="ch-model-calendar-scale"><span>Fewer</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>More orders</span></div>
  </div>;
}
