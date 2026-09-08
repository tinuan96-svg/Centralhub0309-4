import { ReactNode } from 'react';

export const CHART_COLOURS = ['#67e8f9', '#a78bfa', '#6ee7b7', '#fbbf24', '#fb7185', '#60a5fa', '#e879f9', '#94a3b8'];
export type ChartDatum = { label: string; value: number; color?: string };

export function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ch-panel ${className}`}><div className="ch-panel-heading"><div><h2 className="ch-panel-title">{title}</h2>{subtitle && <p className="ch-muted mt-1">{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function EmptyState({ children = 'No records for this selection.' }: { children?: ReactNode }) {
  return <div className="ch-empty">{children}</div>;
}

export function DonutChart({ data, label, format = (n: number) => n.toLocaleString('en-GB') }: { data: ChartDatum[]; label: string; format?: (n: number) => string }) {
  const rows = data.filter(d => Number.isFinite(d.value) && d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState />;
  let offset = 0;
  return <div className="ch-donut-layout"><svg viewBox="0 0 180 180" className="ch-donut" role="img" aria-label={`${label}: ${format(total)}. ${rows.map(d => `${d.label} ${format(d.value)}`).join(', ')}`}>
    <circle cx="90" cy="90" r="69" fill="none" stroke="#252c45" strokeWidth="16" />
    {rows.map((d, i) => { const share = d.value / total * 100; const start = offset; offset += share; return <circle key={d.label} cx="90" cy="90" r="69" fill="none" pathLength="100" stroke={d.color || CHART_COLOURS[i % CHART_COLOURS.length]} strokeWidth="16" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"><title>{d.label + ': ' + format(d.value) + ' (' + share.toFixed(1) + '%)'}</title></circle>; })}
    <text x="90" y="87" textAnchor="middle" fill="#f4f5ff" fontSize={format(total).length > 9 ? 17 : 25} fontWeight="650">{format(total)}</text>
    <text x="90" y="110" textAnchor="middle" fill="#a0acc7" fontSize="12">{label}</text>
  </svg><div className="ch-legend">{rows.map((d, i) => <div key={d.label} className="ch-legend-row"><span className="ch-legend-name"><i className="ch-dot" style={{ background: d.color || CHART_COLOURS[i % CHART_COLOURS.length] }} />{d.label}</span><span className="ch-number">{format(d.value)} <small className="text-slate-400">{(d.value / total * 100).toFixed(0)}%</small></span></div>)}</div></div>;
}

export function MetricBars({ data, format = (n: number) => n.toLocaleString('en-GB') }: { data: ChartDatum[]; format?: (n: number) => string }) {
  const rows = data.filter(d => Number.isFinite(d.value));
  const max = Math.max(0, ...rows.map(d => Math.abs(d.value)));
  if (!rows.length) return <EmptyState />;
  const signed = rows.some(d => d.value < 0);
  return <div className="space-y-4">{rows.map((d, i) => <div key={d.label}><div className="ch-legend-row mb-2"><span className="ch-legend-name">{d.label}</span><span className="ch-number">{format(d.value)}</span></div><div className="ch-bar-track relative" aria-hidden="true">{signed && <span className="absolute left-1/2 h-full border-l border-slate-400" />}<div className="ch-bar-fill" style={{ width: `${max ? Math.abs(d.value) / max * (signed ? 50 : 100) : 0}%`, marginLeft: signed ? `${d.value < 0 && max ? 50 - Math.abs(d.value) / max * 50 : 50}%` : undefined, background: d.color || (d.value < 0 ? '#fb7185' : CHART_COLOURS[i % CHART_COLOURS.length]) }} /></div></div>)}</div>;
}

export function RatioRing({ value, label, detail }: { value: number | null; label: string; detail: string }) {
  const safe = value !== null && Number.isFinite(value) ? value : null;
  const arc = safe === null ? 0 : Math.max(0, Math.min(100, safe));
  return <div className="flex items-center gap-5"><svg viewBox="0 0 120 120" className="w-28 shrink-0" role="img" aria-label={`${label}: ${safe === null ? 'Not available' : `${safe.toFixed(1)}%`}`}><circle cx="60" cy="60" r="48" fill="none" stroke="#252c45" strokeWidth="9" /><circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke={safe !== null && safe < 0 ? '#fb7185' : '#a78bfa'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arc} 100`} transform="rotate(-90 60 60)" /><text x="60" y="66" textAnchor="middle" fill="#f4f5ff" fontSize="22" fontWeight="650">{safe === null ? '—' : `${safe.toFixed(0)}%`}</text></svg><div><p className="ch-panel-title">{label}</p><p className="ch-muted mt-1">{detail}</p></div></div>;
}
