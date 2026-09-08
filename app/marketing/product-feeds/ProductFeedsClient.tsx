'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';
import { marketingService } from '@/lib/services/marketing/marketingService';

type Connection = { provider_id: string; status?: string | null; health_score?: number | null; last_sync_at?: string | null; last_error?: string | null };
type SyncJob = { provider_id?: string | null; status?: string | null; error_message?: string | null; created_at?: string | null };
const labels: Record<string, string> = { google: 'Google Merchant Center', meta: 'Meta Catalog' };

export default function ProductFeedsClient() {
  const { selectedStore } = useStore();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [activeProducts, setActiveProducts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let connectionQuery = supabase.from('marketing_connections').select('provider_id,status,health_score,last_sync_at,last_error').order('provider_id');
      let jobQuery = supabase.from('marketing_sync_jobs').select('provider_id,status,error_message,created_at').order('created_at', { ascending: false }).limit(50);
      let productQuery = supabase.from('products').select('id').eq('is_active', true).eq('is_deleted', false).limit(10000);
      // The central products catalog is shared across stores; feed connections and sync jobs remain store-scoped.
      if (selectedStore?.id) { connectionQuery = connectionQuery.eq('store_id', selectedStore.id); jobQuery = jobQuery.eq('store_id', selectedStore.id); }
      const [connectionResult, jobResult, productResult] = await Promise.all([connectionQuery, jobQuery, productQuery]);
      if (connectionResult.error) throw connectionResult.error;
      if (jobResult.error) throw jobResult.error;
      if (productResult.error) throw productResult.error;
      setConnections(connectionResult.data || []); setJobs(jobResult.data || []); setActiveProducts((productResult.data || []).length);
    } catch (err: any) { setError(err?.message || 'Could not load live product feed data.'); }
    finally { setLoading(false); }
  }, [selectedStore?.id]);

  useEffect(() => { void load(); }, [load]);

  const sync = async (providerId: string) => {
    if (!selectedStore?.id) { setError('Select a specific store before syncing a product feed.'); return; }
    setSyncing(providerId); setError('');
    try { await marketingService.syncConnection(selectedStore.id, providerId); await load(); }
    catch (err: any) { setError(err?.message || `Could not sync ${labels[providerId] || providerId}.`); }
    finally { setSyncing(''); }
  };

  const failedJobs = jobs.filter(job => ['failed', 'error'].includes(String(job.status || '').toLowerCase()));
  const providers = connections.filter(connection => ['google', 'meta'].includes(connection.provider_id));

  return <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
    <div className="flex flex-wrap justify-between items-start gap-4"><PageHeader title="Product Feeds" subtitle="Live catalog connections, sync status and recorded feed failures." /><div className="flex gap-2"><Link href="/marketing/integrations?category=commerce"><Button variant="secondary">Manage Integrations</Button></Link><button onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900">Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3"><Stat label="Active catalog products" value={activeProducts === null ? '—' : activeProducts.toLocaleString('en-GB')} /><Stat label="Connected feeds" value={providers.length} /><Stat label="Recorded sync failures" value={failedJobs.length} /></div>
    <Card className="p-6 bg-slate-900/50 border-slate-800"><div className="flex items-center justify-between gap-3 mb-5"><div><h2 className="text-lg font-bold">Live feed connections</h2><p className="text-xs text-slate-500 mt-1">Only connections and jobs stored for the selected store are shown.</p></div><Link href="/inventory-management/stock" className="text-xs text-cyan-400">Review inventory</Link></div>{loading ? <div className="p-10 text-center text-slate-400">Loading…</div> : providers.length === 0 ? <div className="p-10 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">No Google or Meta feed connection is recorded for this scope. Connect one to enable live catalog sync.</div> : <div className="space-y-3">{providers.map(connection => <div key={connection.provider_id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div><div className="font-bold">{labels[connection.provider_id] || connection.provider_id}</div><div className="text-xs text-slate-500 mt-1">Status: {connection.status || 'unknown'} · Health: {connection.health_score == null ? '—' : `${connection.health_score}%`}</div>{connection.last_error && <div className="text-xs text-red-300 mt-2">{connection.last_error}</div>}</div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Last sync: {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString('en-GB') : 'Never'}</span><button onClick={() => void sync(connection.provider_id)} disabled={syncing === connection.provider_id || !selectedStore?.id} className="px-3 py-2 rounded-lg border border-slate-700 text-xs">{syncing === connection.provider_id ? 'Syncing…' : 'Sync now'}</button></div></div>)}</div>}</Card>
    <Card className="p-6 bg-slate-900/50 border-slate-800"><div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-bold">Recorded feed errors</h2><Link href="/marketing/integrations" className="text-xs text-cyan-400">Connection help</Link></div>{failedJobs.length === 0 ? <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">No failed sync jobs are recorded for this scope.</div> : <div className="space-y-2">{failedJobs.map((job, index) => <div key={`${job.provider_id}-${job.created_at}-${index}`} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"><div className="flex justify-between gap-3 text-xs"><span className="font-bold text-red-200">{labels[job.provider_id || ''] || job.provider_id || 'Unknown provider'}</span><span className="text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleString('en-GB') : '—'}</span></div><p className="text-sm text-slate-300 mt-2">{job.error_message || 'Sync failed without a recorded message.'}</p></div>)}</div>}</Card>
    <div className="flex flex-wrap gap-3"><Link href="/marketing/integrations?category=commerce"><Button variant="secondary">Connect a feed</Button></Link><Link href="/inventory-management/stock"><Button variant="secondary">Fix inventory data</Button></Link></div>
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="text-xl font-black mt-1">{value}</div></div>; }
