'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Alert = {
  id: string;
  supplier_invoice_id: string;
  alert_type: string;
  severity: string;
  status: string;
  due_date: string | null;
  amount_due: number;
  message: string;
};

export default function PayableAlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const refresh = await supabase.rpc('refresh_finance_payable_alerts');
    if (refresh.error) setError(refresh.error.message);
    const result = await supabase
      .from('finance_payable_alerts')
      .select('id,supplier_invoice_id,alert_type,severity,status,due_date,amount_due,message')
      .in('status', ['open', 'acknowledged', 'snoozed'])
      .order('due_date', { ascending: true })
      .limit(100);
    if (result.error) setError(result.error.message);
    setAlerts((result.data || []) as Alert[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    const { error: actionError } = await supabase.rpc('set_finance_payable_alert_status', {
      p_alert_id: id,
      p_status: status,
      p_snoozed_until: status === 'snoozed' ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
    });
    if (actionError) setError(actionError.message);
    else await load();
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Supplier Payment Alerts</h2>
          <p className="section-help">Persistent reminders generated from invoice due dates and outstanding balances.</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Refresh</button>
      </div>
      {error && <div className="m-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {loading ? <div className="p-10 text-center text-slate-500">Refreshing payment alerts…</div> : !alerts.length ? <div className="p-10 text-center text-emerald-300">No open supplier payment alerts.</div> : (
        <div className="divide-y divide-slate-800">
          {alerts.map(alert => (
            <div key={alert.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${alert.severity === 'critical' ? 'bg-rose-500/10 text-rose-300' : alert.severity === 'warning' ? 'bg-amber-500/10 text-amber-300' : 'bg-cyan-500/10 text-cyan-300'}`}>{alert.alert_type.replaceAll('_', ' ')}</span>
                  <span className="text-[10px] text-slate-500">Due {alert.due_date ? new Date(alert.due_date).toLocaleDateString('en-GB') : '—'}</span>
                </div>
                <p className="text-sm text-white font-semibold">{alert.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-white mr-2">{formatCurrency(Number(alert.amount_due || 0))}</span>
                {alert.status === 'open' && <button onClick={() => setStatus(alert.id, 'acknowledged')} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white">Acknowledge</button>}
                <button onClick={() => setStatus(alert.id, 'snoozed')} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300">Snooze 7d</button>
                <button onClick={() => setStatus(alert.id, 'resolved')} className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
