'use client';

import { useState, useEffect } from 'react';
import { PageHeader, StatGrid, StatCard, Card } from '@/lib/design-system';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';

export default function AnalyticsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await whatsappService.getCustomerCareStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Customer Care Analytics" subtitle="Performance metrics for AI and Human support." />

      {loading ? (
        <div className="text-center py-10 text-slate-500">Loading analytics...</div>
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard label="Open Conversations" value={stats?.openConversations?.toString() || '0'} />
            <StatCard label="Human Takeovers" value={stats?.humanTakeover?.toString() || '0'} />
            <StatCard label="Messages Received (Today)" value={stats?.messagesReceivedToday?.toString() || '0'} />
            <StatCard label="Messages Sent (Today)" value={stats?.messagesSentToday?.toString() || '0'} />
          </StatGrid>

          <StatGrid columns={4} className="mt-6">
            <StatCard label="Open Tickets" value={stats?.openTickets?.toString() || '0'} />
            <StatCard label="Tickets Resolved (Today)" value={stats?.resolvedToday?.toString() || '0'} />
            <StatCard label="AI Upsells (Today)" value={stats?.recommendationsToday?.toString() || '0'} />
            <StatCard label="Sales Conversions" value={stats?.conversionsToday?.toString() || '0'} />
          </StatGrid>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <Card className="p-6 bg-slate-900/40 border-slate-800">
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-6">AI Sales Performance</h3>
                <div className="space-y-6">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Revenue Influenced</p>
                            <p className="text-3xl font-black text-white">£{(stats?.conversionsToday * 15 || 0).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Conversion Rate</p>
                            <p className="text-xl font-bold text-emerald-400">{stats?.recommendationsToday > 0 ? ((stats?.conversionsToday / stats?.recommendationsToday) * 100).toFixed(1) : '0.0'}%</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                            <span>Top Recommendation Type</span>
                            <span>Engagement</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                            <div className="bg-amber-500 h-full" style={{ width: '65%' }}></div>
                            <div className="bg-blue-500 h-full" style={{ width: '25%' }}></div>
                            <div className="bg-emerald-500 h-full" style={{ width: '10%' }}></div>
                        </div>
                        <div className="flex gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-300 font-bold">
                                <div className="w-2 h-2 rounded-full bg-amber-500"></div> CROSS-SELL
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-300 font-bold">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div> REPEAT
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 h-full flex flex-col items-center justify-center text-slate-500 italic">
              <span className="text-2xl mb-2">📈</span>
              Conversation Volume Chart
              <span className="text-[10px] mt-2 non-italic">Real-time tracking active</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
