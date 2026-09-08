'use client';

import { useEffect, useState } from 'react';
import { Clock3, WifiOff } from 'lucide-react';
import type { DashboardConnection } from '@/lib/hooks/useLiveDashboardReport';

export default function DashboardLiveStatus({ connection, loading, error, updatedAt }: { connection: DashboardConnection; loading: boolean; error: boolean; updatedAt: Date | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  const age = now && updatedAt ? Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 1000)) : null;
  const stale = error || (age !== null && age > 90);
  const running = connection !== 'offline' && connection !== 'paused' && !stale;
  const label = connection === 'offline' ? 'Offline' : connection === 'paused' ? 'Paused' : stale ? 'Update delayed' : loading ? 'Updating' : connection === 'connected' ? 'Live events' : 'Auto refresh';
  return <div className="ch-live-status" data-running={running} data-updating={loading && running} data-stale={stale} title="Orders, products, inventory movements and messages use existing live events. Other summaries are checked every 30 seconds while this page is visible. Imported analytics retain their source's reporting delay.">
    <span className="ch-live-orbit" aria-hidden="true">{connection === 'offline' ? <WifiOff size={16} /> : <><i /><b /></>}</span>
    <span className="ch-live-label">{label}<small>{age === null ? 'Waiting for data' : `${age < 60 ? age + 's' : Math.floor(age / 60) + 'm'} since report load`} · 30s checks</small></span>
    <span className="ch-console-clock"><Clock3 size={14} aria-hidden="true" /><time dateTime={now?.toISOString()}>{now ? now.toLocaleTimeString('en-GB', { hour12: false }) : '—'}</time></span>
  </div>;
}
