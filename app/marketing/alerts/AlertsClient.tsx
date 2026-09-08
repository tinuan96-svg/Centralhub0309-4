'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

type Insight = { id: string; title: string; description?: string | null; priority?: string | null; status?: string | null; created_at?: string | null };

export default function AlertsClient() {
  const { selectedStore } = useStore();
  const [alerts, setAlerts] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let query = supabase.from('marketing_insights').select('id,title,description,priority,status,created_at').order('created_at', { ascending: false }).limit(100);
      if (selectedStore?.id) query = query.eq('store_id', selectedStore.id);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setAlerts(data || []);
    } catch (err: any) { setError(err?.message || 'Could not load live marketing insights.'); }
    finally { setLoading(false); }
  }, [selectedStore?.id]);

  useEffect(() => { void load(); }, [load]);

  const active = alerts.filter(alert => alert.status === 'new');
  const triggered = alerts.filter(alert => alert.created_at && Date.now() - new Date(alert.created_at).getTime() < 86_400_000);
  const critical = active.filter(alert => ['high', 'critical'].includes(String(alert.priority || '').toLowerCase()));
  const dismiss = async (id: string) => {
    setError('');
    let query = supabase.from('marketing_insights').update({ status: 'dismissed' }).eq('id', id);
    if (selectedStore?.id) query = query.eq('store_id', selectedStore.id);
    const { error: updateError } = await query;
    if (updateError) setError(updateError.message); else await load();
  };
  const priorityClass = (priority?: string | null) => String(priority || '').toLowerCase() === 'high' || String(priority || '').toLowerCase() === 'critical' ? 'border-red-500/30 bg-red-500/10' : 'border-slate-800 bg-slate-950/50';

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
    <div className="flex flex-wrap justify-between items-start gap-4"><PageHeader title="Marketing Alerts" subtitle="Operational insights generated from live CentralHub data." /><div className="flex gap-2"><Link href="/business-intelligence/automation"><Button variant="secondary">Alert Rules</Button></Link><Link href="/marketing/settings"><Button>Settings</Button></Link><button onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Active insights" value={active.length} /><Stat label="Triggered (24h)" value={triggered.length} /><Stat label="High priority" value={critical.length} /><Stat label="Signal health" value={alerts.length ? 'Live' : 'No signal'} /></div>
    <Card className="p-6 bg-slate-900/50 border-slate-800"><div className="flex items-center justify-between gap-3 mb-5"><div><h2 className="text-lg font-bold">Live alert feed</h2><p className="text-xs text-slate-500 mt-1">Dismissal updates the persisted insight record; no synthetic provider alerts are shown.</p></div><Link href="/marketing/reports" className="text-xs text-cyan-400">View reports</Link></div>{loading ? <div className="p-10 text-center text-slate-400">Loading…</div> : active.length === 0 ? <div className="p-10 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">No active marketing insights for this scope.</div> : <div className="space-y-3">{active.map(alert => <div key={alert.id} className={`rounded-xl border p-4 ${priorityClass(alert.priority)}`}><div className="flex flex-wrap justify-between gap-3"><div><div className="font-bold">{alert.title}</div><p className="text-sm text-slate-400 mt-1">{alert.description || 'No additional detail recorded.'}</p></div><div className="flex items-start gap-2"><span className="text-[10px] uppercase tracking-widest text-slate-500">{alert.priority || 'normal'}</span><button onClick={() => void dismiss(alert.id)} className="text-xs text-slate-400 hover:text-white">Dismiss</button></div></div><div className="text-[10px] text-slate-600 mt-3">{alert.created_at ? new Date(alert.created_at).toLocaleString('en-GB') : 'Unknown time'}</div></div>)}</div>}</Card>
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>; }
