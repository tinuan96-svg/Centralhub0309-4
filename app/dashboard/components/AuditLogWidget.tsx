'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';

export default function AuditLogWidget() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fallback to inventory logs if activity_logs is empty or doesn't exist yet
      const { data } = await supabase
        .from('inventory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);

      setLogs(data || []);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Activity Ledger</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Audit Trail & System Events</p>
        </div>
        <button className="text-[10px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors">
          Download Logs
        </button>
      </div>

      <div className="space-y-4">
        {logs.map((log, idx) => (
          <div key={log.id} className="flex items-start gap-4 group">
            <div className="pt-1">
               <div className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700 group-hover:border-cyan-500 transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex justify-between items-start mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate pr-4">
                    {log.product_name || log.entity_type || 'System Action'}
                  </p>
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest shrink-0">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
               </div>
               <p className="text-xs text-slate-500 line-clamp-1 group-hover:text-slate-300 transition-colors">
                 {log.notes || log.action || 'Performed system update'}
               </p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
           <div className="py-12 text-center opacity-30">
              <p className="text-[10px] font-black uppercase tracking-widest">No recent entries</p>
           </div>
        )}
      </div>

      <div className="pt-4 text-center">
         <button className="text-[9px] font-black text-cyan-600 hover:text-cyan-500 uppercase tracking-widest transition-all">
           View Full Audit History →
         </button>
      </div>
    </section>
  );
}
