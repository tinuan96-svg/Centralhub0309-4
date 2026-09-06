'use client';

import { useState, useEffect } from 'react';
import { PageHeader, StatGrid, StatCard, Card } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

export default function AIUsageClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [stats, setStats] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAIStats();
  }, []);

  const loadAIStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch Stats from View
      const { data: statsData } = await supabase.from('ai_usage_stats').select('*');
      setStats(statsData || []);

      // 2. Fetch Recent Logs
      const { data: logsData } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentLogs(logsData || []);
    } catch (err) {
      console.error('Failed to load AI stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const totals = {
    calls: stats.reduce((sum, s) => sum + Number(s.total_calls), 0),
    tokens: stats.reduce((sum, s) => sum + Number(s.total_tokens), 0),
    cost: stats.reduce((sum, s) => sum + Number(s.total_cost || 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="AI Intelligence Audit"
        subtitle="Monitoring OpenAI usage, costs, and model performance across CentralHub."
        action={<button onClick={loadAIStats} className="text-xs font-bold px-4 py-2 bg-slate-800 rounded-xl text-white">Refresh Audit</button>}
      />

      <StatGrid columns={4}>
        <StatCard label="Total AI Calls" value={totals.calls.toString()} />
        <StatCard label="Token Consumption" value={(totals.tokens / 1000).toFixed(1) + 'k'} />
        <StatCard label="Est. OpenAI Cost" value={formatCurrency(totals.cost)} />
        <StatCard label="Active Models" value={new Set(stats.map(s => s.model)).size.toString()} />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-slate-900/40 border-slate-800">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Usage by Feature</h3>
            <div className="space-y-4">
                {stats.map((s) => (
                    <div key={`${s.feature}-${s.model}`} className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl border border-slate-700">
                        <div>
                            <p className="text-xs font-bold text-slate-100 uppercase">{s.feature.replace('_', ' ')}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{s.model}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-black text-white">{s.total_calls} calls</p>
                            <p className="text-[10px] text-emerald-400 font-bold">{formatCurrency(s.total_cost)}</p>
                        </div>
                    </div>
                ))}
                {stats.length === 0 && <p className="text-center text-slate-500 italic py-10">No AI usage data recorded yet.</p>}
            </div>
        </Card>

        <Card className="p-6 bg-slate-900/40 border-slate-800">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Recent AI Activity</h3>
            <div className="space-y-3">
                {recentLogs.map((log) => (
                    <div key={log.id} className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                        <div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black mr-2 ${log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {log.status.toUpperCase()}
                            </span>
                            <span className="text-slate-300 font-medium">{log.feature}</span>
                        </div>
                        <span className="text-slate-500 font-mono">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                ))}
            </div>
        </Card>
      </div>

      <Card className="p-4 bg-blue-500/5 border-blue-500/20">
          <div className="flex items-start gap-4">
              <span className="text-xl">💡</span>
              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                  CentralHub uses a <b>deterministic-first</b> architecture to minimize OpenAI costs.
                  Calls are only made when GTIN/SKU matching fails or natural language reasoning is required.
                  Model fallback uses <b>gpt-4o-mini</b> for high-volume tasks and <b>gpt-4o</b> for reasoning.
              </p>
          </div>
      </Card>
    </div>
  );
}
