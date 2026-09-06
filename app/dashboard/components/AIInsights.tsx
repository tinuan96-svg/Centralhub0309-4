'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import Link from 'next/link';

export default function AIInsights() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from('intelligence_recommendations')
        .select('*')
        .eq('status', 'recommended');

      if (selectedStoreId !== 'all') {
        query = query.eq('store_id', selectedStoreId);
      }

      const { data } = await query
        .order('created_at', { ascending: false })
        .limit(3);

      setInsights(data || []);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-blue-500/20 rounded-[2.5rem] p-8 shadow-2xl space-y-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5">
         <span className="text-8xl">🤖</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">AI Intelligence</h2>
           <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">Operational Recommendations</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
          Generate Insights
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {insights.map(insight => (
          <div key={insight.id} className="p-5 bg-blue-900/10 border border-blue-500/20 rounded-2xl group hover:border-blue-500/40 transition-all">
             <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-lg border border-blue-500/30">
                   {insight.recommendation_type === 'inventory_reorder' ? '📦' :
                    insight.recommendation_type === 'pricing_opportunity' ? '💰' : '✨'}
                </div>
                <div className="flex-1">
                   <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">{insight.title}</h3>
                   <p className="text-xs text-slate-400 leading-relaxed">{insight.description}</p>
                   <div className="mt-4 flex items-center gap-4">
                      <button className="text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors">
                        Approve Action
                      </button>
                      <span className="text-slate-700">•</span>
                      <button className="text-[10px] font-black text-slate-500 hover:text-slate-400 uppercase tracking-widest transition-colors">
                        Dismiss
                      </button>
                   </div>
                </div>
             </div>
          </div>
        ))}
        {insights.length === 0 && (
           <div className="py-12 text-center border border-dashed border-slate-800 rounded-3xl">
              <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No automated insights available at this threshold</p>
           </div>
        )}
      </div>
    </section>
  );
}
