import { useId } from 'react';

export default function MicroTrend({ values, label, color = '#50e4eb' }: { values: number[]; label: string; color?: string }) {
  const id = useId().replace(/:/g, '');
  if (!values.length || values.some(value => !Number.isFinite(value))) return <span className="ch-model-meta">Trend unavailable</span>;
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const point = (value: number, index: number) => ({ x: values.length === 1 ? 60 : 3 + index / (values.length - 1) * 114, y: 36 - (value - min) / (max - min) * 30 });
  const points = values.map(point);
  const last = points[points.length - 1];
  return <svg className="ch-micro-trend" viewBox="0 0 120 40" role="img" aria-label={label + '. ' + values.length + ' daily readings.'}>
    <title>{`${label}. First: ${values[0].toFixed(2)}; latest: ${values[values.length - 1].toFixed(2)}. Full daily values in the sales chart.`}</title>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity=".01" /></linearGradient></defs>
    <path d={`M ${points[0].x} 39 L ${points.map(p => p.x + ' ' + p.y).join(' L ')} L ${last.x} 39 Z`} fill={'url(#' + id + ')'} />
    <polyline points={points.map(p => p.x + ',' + p.y).join(' ')} stroke={color} fill="none" strokeWidth="1.5" />
    <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
  </svg>;
}
