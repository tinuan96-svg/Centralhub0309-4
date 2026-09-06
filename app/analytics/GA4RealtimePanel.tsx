'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/lib/design-system';
import { marketingService } from '@/lib/services/marketing/marketingService';

export default function GA4RealtimePanel({ storeId }: { storeId?: string | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setRows([]); return; }
    setLoading(true); setError(null);
    try { const result = await marketingService.getGA4Realtime(storeId); setRows(result.rows || []); }
    catch (err: any) { setRows([]); setError(err?.message || 'GA4 realtime data unavailable'); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer); }, [load]);

  if (!storeId) return null;
  const activeUsers = rows.reduce((sum, row) => sum + Number(row.metricValues?.[0]?.value || 0), 0);
  const events = rows.reduce((sum, row) => sum + Number(row.metricValues?.[1]?.value || 0), 0);
  const views = rows.reduce((sum, row) => sum + Number(row.metricValues?.[2]?.value || 0), 0);

  return <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex items-center justify-between gap-4 mb-5"><div><h2 className="text-lg font-black text-white uppercase">Google GA4 Realtime</h2><p className="text-xs text-slate-500 mt-1">Direct from the selected GA4 property • refreshes every 60 seconds</p></div><button type="button" onClick={() => void load()} disabled={loading} className="text-xs text-slate-400 hover:text-white disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button></div>{error ? <p className="text-xs text-amber-300">{error}</p> : <div className="grid grid-cols-3 gap-3"><div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600">Active users</p><p className="text-xl font-black text-white mt-1">{activeUsers.toLocaleString()}</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600">Events</p><p className="text-xl font-black text-white mt-1">{events.toLocaleString()}</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600">Views</p><p className="text-xl font-black text-white mt-1">{views.toLocaleString()}</p></div></div>}</Card>;
}
