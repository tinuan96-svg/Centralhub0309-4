'use client';

import Link from 'next/link';
import { Activity, Clock3, Radar, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Store = { id: string; name: string; slug: string };
type Heartbeat = { store_id: string; status: 'online' | 'degraded' | 'offline' | 'unknown'; latency_ms: number | null; http_status: number | null; security_score: number; checked_at: string };
type SecurityEvent = { id: string; store_id: string; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; status: 'open' | 'acknowledged' | 'resolved' | 'ignored'; occurred_at: string };

const severityWeight: Record<SecurityEvent['severity'], number> = { info: 0, low: 2, medium: 6, high: 14, critical: 30 };
const tone = { online: '#42d6ad', degraded: '#fbbf24', offline: '#fb7185', unknown: '#64748b' } as const;

function age(value?: string) {
  if (!value) return 'No heartbeat';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function SecurityPulse({ selectedStoreId = 'all', compact = false }: { selectedStoreId?: string; compact?: boolean }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [storeResult, heartbeatResult, eventResult] = await Promise.all([
      supabase.from('stores').select('id,name,slug').eq('visibility', true).order('name'),
      supabase.from('security_heartbeats').select('store_id,status,latency_ms,http_status,security_score,checked_at'),
      supabase.from('security_events').select('id,store_id,severity,status,occurred_at').gte('occurred_at', since).in('status', ['open', 'acknowledged']).order('occurred_at', { ascending: false }).limit(100),
    ]);
    const failure = storeResult.error || heartbeatResult.error || eventResult.error;
    if (failure) { setError(failure.message); return; }
    setStores((storeResult.data || []) as Store[]);
    setHeartbeats((heartbeatResult.data || []) as Heartbeat[]);
    setEvents((eventResult.data || []) as SecurityEvent[]);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 350); };
    const channel = supabase.channel(`security-pulse-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_heartbeats' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_events' }, refreshSoon)
      .subscribe(status => setConnection(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'));
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const fallback = window.setInterval(() => void load(), 60000);
    return () => { if (timer) clearTimeout(timer); window.clearInterval(clock); window.clearInterval(fallback); void supabase.removeChannel(channel); };
  }, [load]);

  const visibleStores = stores.filter(store => selectedStoreId === 'all' || store.id === selectedStoreId);
  const summary = useMemo(() => {
    const rows = visibleStores.map(store => {
      const heartbeat = heartbeats.find(item => item.store_id === store.id);
      const stale = !heartbeat || now - new Date(heartbeat.checked_at).getTime() > 180000;
      const status = stale ? 'unknown' : heartbeat.status;
      const open = events.filter(event => event.store_id === store.id);
      const penalty = open.reduce((total, event) => total + severityWeight[event.severity], 0);
      const score = Math.max(0, Math.min(100, (heartbeat?.security_score ?? 0) - penalty));
      return { store, heartbeat, status, open, score };
    });
    const score = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
    return { rows, score, active: rows.reduce((sum, row) => sum + row.open.length, 0), protected: rows.filter(row => row.status === 'online').length };
  }, [events, heartbeats, now, visibleStores]);

  const overall = summary.rows.some(row => row.status === 'offline' || row.open.some(event => event.severity === 'critical')) ? 'offline' : summary.rows.some(row => row.status !== 'online' || row.open.some(event => ['high', 'medium'].includes(event.severity))) ? 'degraded' : summary.rows.length ? 'online' : 'unknown';

  return <section className={`ch-panel ch-security-pulse ${compact ? 'ch-security-pulse-compact' : ''}`} aria-label="Live security pulse">
    <div className="ch-panel-heading"><div><h2 className="ch-panel-title flex items-center gap-2"><Radar size={18} /> Security Pulse</h2><p className="ch-muted">24×7 independent availability, TLS and browser-security checks</p></div><span className={`ch-live-state ch-live-${connection}`}><span />{connection}</span></div>
    {error ? <div className="ch-metric-state" role="alert"><WifiOff size={24} /><span>Security telemetry unavailable</span></div> : <div className="ch-security-layout">
      <div className="ch-radar" style={{ '--radar-tone': tone[overall] } as React.CSSProperties} data-status={overall}>
        <div className="ch-radar-grid" /><div className="ch-radar-sweep" /><div className="ch-radar-core"><strong>{summary.score}</strong><span>security</span></div>
        {summary.rows.map((row, index) => <i key={row.store.id} style={{ transform: `rotate(${index * (360 / Math.max(summary.rows.length, 1))}deg) translateY(-42%)`, background: tone[row.status] }} title={`${row.store.name}: ${row.status}`} />)}
      </div>
      <div className="ch-security-summary"><div className="ch-visual-metrics ch-visual-metrics-column"><div className="ch-visual-metric"><span><ShieldCheck size={15} /> Protected now</span><strong>{summary.protected}/{summary.rows.length}</strong></div><div className="ch-visual-metric"><span><ShieldAlert size={15} /> Active signals</span><strong>{summary.active}</strong><small>Open or acknowledged · last 24h</small></div></div></div>
      <div className="ch-security-stores">{summary.rows.map(row => <div key={row.store.id}><span className="ch-status-dot" style={{ background: tone[row.status] }} /><span><b>{row.store.name}</b><small>{row.status} · {row.heartbeat?.latency_ms != null ? `${row.heartbeat.latency_ms}ms` : 'latency —'}</small></span><time><Clock3 size={12} />{age(row.heartbeat?.checked_at)}</time></div>)}</div>
    </div>}
    <div className="ch-security-footer"><span><Activity size={13} /> Values update automatically</span><Link href="/site-health">Open Security Centre →</Link></div>
  </section>;
}
