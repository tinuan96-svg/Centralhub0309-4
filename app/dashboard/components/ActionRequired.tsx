'use client';

import { useEffect, useState } from 'react';
import { ActionRequiredService, ActionAlert } from '@/lib/services/system/actionRequiredService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import Link from 'next/link';

export default function ActionRequired() {
  const [alerts, setAlerts] = useState<ActionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await ActionRequiredService.getActionAlerts(selectedStoreId);
      setAlerts(data);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-slate-800/30 border border-slate-800 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
         <span className="text-lg">⚡</span>
         <h2 className="text-lg font-black text-slate-200 uppercase tracking-tighter">Command Centre: Action Required</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {alerts.map(alert => (
          <Link
            key={alert.id}
            href={alert.actionUrl}
            className={`group flex items-start gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-95 ${
              alert.severity === 'critical' ? 'bg-rose-900/10 border-rose-500/20 hover:border-rose-500/50' :
              alert.severity === 'warning' ? 'bg-amber-900/10 border-amber-500/20 hover:border-amber-500/50' :
              'bg-blue-900/10 border-blue-500/20 hover:border-blue-500/50'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
              alert.severity === 'critical' ? 'bg-rose-600 text-white' :
              alert.severity === 'warning' ? 'bg-amber-500 text-white' :
              'bg-blue-600 text-white'
            }`}>
              <span className="font-black">{alert.count}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-tight truncate group-hover:text-white transition-colors">{alert.title}</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{alert.subtitle}</p>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter text-cyan-400 group-hover:text-cyan-300">
                {alert.actionLabel} <span className="text-xs">→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
