import type { ReactNode } from 'react';
import { CircleAlert, CircleDashed, Minus } from 'lucide-react';

export function VisualMetric({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <div className="ch-visual-metric" title={detail}><span className="ch-model-meta">{icon}{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function MetricState({ loading = false, error = false, label = 'No records' }: { loading?: boolean; error?: boolean; label?: string }) {
  const Icon = loading ? CircleDashed : error ? CircleAlert : Minus;
  return <div className="ch-metric-state" role={error ? 'alert' : 'status'}><Icon size={27} className={loading ? 'animate-spin' : ''} aria-hidden="true" /><span>{loading ? 'Loading' : error ? 'Unavailable' : label}</span></div>;
}
