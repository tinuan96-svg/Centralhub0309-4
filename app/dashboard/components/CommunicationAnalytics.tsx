'use client';

import { useState, useEffect } from 'react';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import Link from 'next/link';

export default function CommunicationAnalytics() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await whatsappService.getCustomerCareStats(selectedStoreId === 'all' ? undefined : selectedStoreId);
      setStats(data);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Customer Communications</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">WhatsApp & Meta Channels</p>
        </div>
        <Link href="/customer-care" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all">
          Open Inbox →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
         <div className="bg-slate-950/40 p-6 rounded-2xl border border-slate-800/50">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Open Enquiries</p>
            <div className="flex items-end gap-3">
               <p className="text-4xl font-black text-white">{stats?.openConversations || 0}</p>
               {stats?.humanTakeover > 0 && (
                 <p className="text-[10px] text-amber-400 font-black uppercase mb-1">+{stats.humanTakeover} Human</p>
               )}
            </div>
         </div>
         <div className="bg-slate-950/40 p-6 rounded-2xl border border-slate-800/50">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Resolved Today</p>
            <p className="text-4xl font-black text-emerald-400">{stats?.resolvedToday || 0}</p>
         </div>
      </div>

      <div className="space-y-6">
         <div className="space-y-3">
            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
               <span>Inbound Velocity</span>
               <span className="text-slate-300">{stats?.messagesReceivedToday || 0} msgs</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
               <div className="h-full bg-cyan-500" style={{ width: '65%' }} />
            </div>
         </div>
         <div className="space-y-3">
            <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
               <span>Outbound Engagement</span>
               <span className="text-slate-300">{stats?.messagesSentToday || 0} msgs</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500" style={{ width: '45%' }} />
            </div>
         </div>
      </div>

      <div className="pt-6 border-t border-slate-800/50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
         <div className="flex items-center gap-4">
            <span className="text-slate-500">Status:</span>
            <span className="text-emerald-400 flex items-center gap-1.5">
               <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span> Meta Verified
            </span>
         </div>
         <span className="text-slate-600">API Latency: 240ms</span>
      </div>
    </section>
  );
}
