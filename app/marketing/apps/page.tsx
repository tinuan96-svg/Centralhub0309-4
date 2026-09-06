'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Store = { id: string; name: string; slug?: string | null };
type AppRow = { id: string; store_id: string; platform: string; package_identifier: string; display_name: string | null; external_app_id: string | null; firebase_app_id: string | null; status: string; metadata: Record<string, any> };
type Metric = { app_id: string; metric_date: string; impressions: number; product_page_views: number; downloads: number; installs: number; active_users: number; crashes: number; conversions: number; spend: number; revenue: number; currency: string };
type SyncRun = { id: string; app_id: string | null; provider_id: string; status: string; rows_imported: number; completed_at: string | null; created_at: string; last_error: string | null };
type Release = { id: string; app_id: string; provider_id: string; version_name: string | null; build_number: string | null; status: string; target_track: string | null; created_at: string; last_error: string | null };

export default function AppMarketingPage() {
  const [stores, setStores] = useState<Store[]>([]); const [apps, setApps] = useState<AppRow[]>([]); const [metrics, setMetrics] = useState<Metric[]>([]); const [runs, setRuns] = useState<SyncRun[]>([]); const [releases, setReleases] = useState<Release[]>([]);
  const [storeId, setStoreId] = useState('all'); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [s, a, m, r, rel] = await Promise.all([
      supabase.from('stores').select('id,name,slug').order('name'),
      supabase.from('app_marketing_apps').select('*').order('display_name'),
      supabase.from('app_marketing_daily_metrics').select('app_id,metric_date,impressions,product_page_views,downloads,installs,active_users,crashes,conversions,spend,revenue,currency').order('metric_date', { ascending: false }).limit(2000),
      supabase.from('app_marketing_sync_runs').select('id,app_id,provider_id,status,rows_imported,completed_at,created_at,last_error').order('created_at', { ascending: false }).limit(100),
      supabase.from('app_releases').select('id,app_id,provider_id,version_name,build_number,status,target_track,created_at,last_error').order('created_at', { ascending: false }).limit(100),
    ]);
    const firstError = s.error || a.error || m.error || r.error || rel.error; if (firstError) setError(firstError.message);
    setStores((s.data || []) as Store[]); setApps((a.data || []) as AppRow[]); setMetrics((m.data || []) as Metric[]); setRuns((r.data || []) as SyncRun[]); setReleases((rel.data || []) as Release[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const storeMap = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores]); const shownApps = apps.filter(a => storeId === 'all' || a.store_id === storeId); const shownIds = new Set(shownApps.map(a => a.id)); const shownMetrics = metrics.filter(m => shownIds.has(m.app_id));
  const totals = shownMetrics.reduce((x, m) => ({ installs: x.installs + Number(m.installs || 0), active: x.active + Number(m.active_users || 0), conversions: x.conversions + Number(m.conversions || 0), spend: x.spend + Number(m.spend || 0), revenue: x.revenue + Number(m.revenue || 0) }), { installs: 0, active: 0, conversions: 0, spend: 0, revenue: 0 });
  return <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><h1 className="text-2xl md:text-3xl font-black text-slate-100">App Marketing & Store Analytics</h1><p className="text-sm text-slate-400 mt-1">Android/iOS identities, store analytics, release status and store-isolated provider readiness in one place.</p></div><div className="flex gap-2"><Link href="/marketing/integrations" className="px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-sm font-bold">Connections</Link><button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm">Refresh</button></div></div>
    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm">{error}</div>}
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"><label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-2">Store</label><select value={storeId} onChange={e=>setStoreId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 min-w-72"><option value="all">All stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"><Stat label="Registered apps" value={shownApps.length}/><Stat label="Installs" value={totals.installs}/><Stat label="Active users" value={totals.active}/><Stat label="Conversions" value={totals.conversions}/><Stat label="Spend" value={`£${totals.spend.toFixed(2)}`}/><Stat label="Revenue" value={`£${totals.revenue.toFixed(2)}`}/></div>
    {loading ? <div className="p-10 text-center text-slate-400">Loading app marketing foundation…</div> : <div className="grid xl:grid-cols-2 gap-4">{shownApps.map(app => { const store = storeMap.get(app.store_id); const appMetrics = shownMetrics.filter(m => m.app_id === app.id); const appReleases = releases.filter(r => r.app_id === app.id).slice(0,3); const appRuns = runs.filter(r => r.app_id === app.id).slice(0,3); return <section key={app.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-2xl">{app.platform === 'ios' ? '🍎' : '🤖'}</span><h2 className="text-lg font-black text-slate-100">{app.display_name || app.package_identifier}</h2></div><p className="text-xs text-slate-500 mt-1">{store?.name || 'Unknown store'} · {app.package_identifier}</p></div><Status value={app.status}/></div>
      {app.metadata?.blocking_reason && <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">{String(app.metadata.blocking_reason)}</div>}
      <div className="grid grid-cols-3 gap-2"><Mini label="Metric days" value={appMetrics.length}/><Mini label="Latest installs" value={appMetrics[0]?.installs || 0}/><Mini label="Latest active" value={appMetrics[0]?.active_users || 0}/></div>
      <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Recent releases</p>{appReleases.length ? appReleases.map(r=><div key={r.id} className="flex justify-between gap-3 py-2 border-t border-slate-800 text-xs"><span className="text-slate-300">{r.version_name || 'Version pending'}{r.build_number ? ` (${r.build_number})` : ''} {r.target_track ? `· ${r.target_track}` : ''}</span><Status value={r.status}/></div>) : <p className="text-xs text-slate-600">No release records yet.</p>}</div>
      <div><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Recent analytics sync</p>{appRuns.length ? appRuns.map(r=><div key={r.id} className="flex justify-between gap-3 py-2 border-t border-slate-800 text-xs"><span className="text-slate-400">{r.provider_id} · {r.rows_imported} rows</span><Status value={r.status}/></div>) : <p className="text-xs text-slate-600">No app-store analytics sync recorded yet.</p>}</div>
    </section>; })}</div>}
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400"><p className="font-bold text-slate-200 mb-1">Isolation rule preserved</p><p>Every app belongs to one store. Credentials stay in the encrypted provider configuration layer; this page does not expose secrets or merge identities between businesses.</p></div>
  </div>;
}
function Stat({label,value}:{label:string;value:number|string}) { return <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p><p className="text-xl font-black text-slate-100 mt-1">{typeof value==='number'?value.toLocaleString():value}</p></div> }
function Mini({label,value}:{label:string;value:number|string}) { return <div className="bg-slate-950/70 rounded-xl p-3"><p className="text-[9px] uppercase text-slate-600 font-bold">{label}</p><p className="text-sm font-bold text-slate-200 mt-1">{value}</p></div> }
function Status({value}:{value:string}) { const good=['configured','healthy','completed','succeeded','released','submitted','ready'].includes(value); const warn=['needs_native_sync','processing','publishing','queued','running','upload_pending'].includes(value); return <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${good?'bg-emerald-500/10 border-emerald-500/30 text-emerald-300':warn?'bg-amber-500/10 border-amber-500/30 text-amber-300':'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>{value.replaceAll('_',' ')}</span> }
