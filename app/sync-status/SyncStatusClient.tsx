'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { syncOrders } from '@/lib/services/orderSyncClient';

interface OrderSyncStats {
  lastSync: string | null;
  syncedToday: number;
  failedToday: number;
  pendingCount: number;
}

interface DiagStep {
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'pending';
  detail: string;
}

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-500">Never</span>;
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  let label = 'Just now';
  if (mins >= 1 && mins < 60) label = `${mins}m ago`;
  else if (hrs >= 1 && hrs < 24) label = `${hrs}h ago`;
  else if (diff >= 86400000) label = d.toLocaleDateString();
  return <span title={d.toLocaleString()} className="text-slate-200">{label}</span>;
}

function StepIcon({ status }: { status: DiagStep['status'] }) {
  if (status === 'pass') return <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 text-xs flex items-center justify-center font-bold">✓</span>;
  if (status === 'fail') return <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500 text-red-400 text-xs flex items-center justify-center font-bold">✗</span>;
  if (status === 'warn') return <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500 text-amber-400 text-xs flex items-center justify-center font-bold">!</span>;
  return <span className="w-5 h-5 rounded-full bg-slate-700 border border-slate-600 text-slate-400 text-xs flex items-center justify-center">·</span>;
}

export default function SyncStatusPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [stats, setStats] = useState<OrderSyncStats>({ lastSync: null, syncedToday: 0, failedToday: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [syncNowLoading, setSyncNowLoading] = useState(false);
  const [syncNowResult, setSyncNowResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagReport, setDiagReport] = useState<DiagStep[] | null>(null);

  const loadData = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: orders } = await supabase
        .from('orders')
        .select('created_at, order_status, payment_status')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (orders) {
        const lastSync = orders[0]?.created_at ?? null;
        const syncedToday = orders.filter(o => new Date(o.created_at) >= todayStart).length;
        const pendingCount = orders.filter(o => o.order_status === 'pending_payment').length;

        setStats({ lastSync, syncedToday, failedToday: 0, pendingCount });
      }
    } catch (e) {
      console.error('Error loading ingestion stats:', e);
    }
  }, []);

  useEffect(() => {
    loadData().then(() => setLoading(false));
  }, [loadData]);

  const syncOrdersNow = async () => {
    setSyncNowLoading(true);
    setSyncNowResult(null);
    try {
      const data = await syncOrders();

      if (data.success && !(data.failures && data.failures.length > 0)) {
        setSyncNowResult({ ok: true, message: data.message || `Sync complete: ${data.imported || 0} orders imported.` });
        await loadData();
      } else {
        const failures = data.failures?.map((failure) => `${failure.store}: ${failure.error}`).join('; ');
        setSyncNowResult({ ok: false, message: failures || data.error || data.message || 'Order sync failed' });
      }
    } catch (err) {
      setSyncNowResult({ ok: false, message: `Error: ${(err as Error).message}` });
    }
    setSyncNowLoading(false);
  };

  const runDiagnostics = async () => {
    setDiagLoading(true);
    const steps: DiagStep[] = [];

    try {
      const { data: stores, error } = await supabase.from('stores').select('id, name');
      if (error) throw error;
      steps.push({ label: 'CentralHub Registry', status: 'pass', detail: `${stores?.length || 0} stores configured.` });
    } catch (e) {
      steps.push({ label: 'CentralHub Registry', status: 'fail', detail: 'Connection to stores registry failed.' });
    }

    try {
      const { data, error } = await supabase.functions.invoke('sync-orders-health');
      if (error || !data?.success) {
        steps.push({ label: 'Order Ingestion Service', status: 'fail', detail: data?.error || error?.message || 'Order sync service is unhealthy.' });
      } else {
        steps.push({ label: 'Order Ingestion Service', status: 'pass', detail: 'Order sync service is reachable.' });
      }
    } catch (e) {
      steps.push({ label: 'Order Ingestion Service', status: 'warn', detail: 'Service connectivity could not be verified.' });
    }

    setDiagReport(steps);
    setDiagLoading(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tight">Order Sync Monitor</h1>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">Monitoring real-time ingestion from remote storefronts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={syncOrdersNow} disabled={syncNowLoading}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-blue-900/20">
            {syncNowLoading ? 'Syncing...' : 'Ingest Now'}
          </button>
          <button onClick={runDiagnostics} disabled={diagLoading}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl transition-all border border-slate-700">
            {diagLoading ? 'Checking...' : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      {syncNowResult && (
        <div className={`px-4 py-3 rounded-xl text-xs font-bold border animate-in slide-in-from-top-2 duration-300 ${syncNowResult.ok ? 'bg-emerald-900/30 text-emerald-300 border-emerald-500/20' : 'bg-rose-900/30 text-rose-300 border-rose-500/20'}`}>
          {syncNowResult.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Last Ingestion', value: <RelativeTime iso={stats.lastSync} />, icon: '🕒' },
          { label: 'Ingested Today', value: stats.syncedToday, icon: '🛒' },
          { label: 'Pending Payment', value: stats.pendingCount, icon: '💳' },
        ].map(card => (
          <div key={card.label} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl shadow-inner">{card.icon}</div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{card.label}</p>
              <p className="text-xl font-bold text-white mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {diagReport && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 animate-in fade-in duration-500">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Diagnostics Result</h2>
          <div className="space-y-3">
            {diagReport.map((step, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <StepIcon status={step.status} />
                <div>
                  <p className="text-sm font-bold text-slate-200 leading-none">{step.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900/40 border border-blue-500/20 rounded-3xl p-6 flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl shrink-0">📡</div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-blue-400">Direct Ingestion Model</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            CentralHub pulls orders directly from MalluSpices, PocketGrocery, and KeralaGroceries.
            The system avoids the unreliable central product queue, ensuring that every order in this dashboard
            is a direct reflection of remote storefront activity.
          </p>
        </div>
      </div>
    </div>
  );
}
