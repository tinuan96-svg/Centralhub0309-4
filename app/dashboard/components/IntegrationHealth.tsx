'use client';

import { useState, useEffect } from 'react';
import { IntegrationService, IntegrationStatus } from '@/lib/services/system/integrationService';

export default function IntegrationHealth() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await IntegrationService.getHealthStats();
      setIntegrations(data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="h-40 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const hasError = integrations.some(item => item.status === 'error');
  const hasWarning = integrations.some(item => item.status === 'warning');
  const allHealthy = integrations.length > 0 && integrations.every(item => item.status === 'healthy');
  const overallLabel = hasError ? 'Integration Errors' : hasWarning ? 'Attention Required' : allHealthy ? 'All Core Hubs Online' : 'No Integration Data';
  const overallDot = hasError ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : hasWarning ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : allHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500';

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">System Integrations</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Connectivity & Sync Health</p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <span className={`w-2 h-2 rounded-full ${overallDot}`} />
          <span className="text-[10px] font-black text-slate-100 uppercase tracking-widest">{overallLabel}</span>
        </div>
      </div>

      <div className="space-y-4">
        {integrations.length === 0 && <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30 text-xs text-slate-500">No integration health data is available yet.</div>}
        {integrations.map(int => (
          <div key={int.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30 group hover:border-slate-600 transition-all">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-2 h-10 rounded-full shrink-0 ${int.status === 'healthy' ? 'bg-emerald-500' : int.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-200 uppercase tracking-tight">{int.name}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest break-words">
                  {int.status === 'healthy' ? 'Operational' : int.latestError || 'Issues detected'}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Last Pulse</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                {int.lastSync ? new Date(int.lastSync).toLocaleTimeString() : 'No pulse yet'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
