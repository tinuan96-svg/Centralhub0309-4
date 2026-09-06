'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button } from '@/lib/design-system';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';
import Link from 'next/link';

export default function CustomerCareDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    whatsappService.getCustomerCareStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  const menuItems = [
    { title: 'Inbox', desc: 'Real-time customer chat', icon: '📥', href: '/customer-care/inbox' },
    { title: 'Tickets', desc: 'Manage support issues', icon: '🎫', href: '/customer-care/tickets' },
    { title: 'AI Assistant', desc: 'AI behavior & automation', icon: '🤖', href: '/customer-care/ai-assistant' },
    { title: 'Knowledge Base', desc: 'Training data for AI', icon: '📚', href: '/customer-care/knowledge-base' },
    { title: 'Templates', desc: 'WhatsApp Meta messages', icon: '💬', href: '/customer-care/templates' },
    { title: 'Channels', desc: 'Meta account links', icon: '🔌', href: '/customer-care/channels' },
  ];

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Customer Care Control Centre"
        subtitle="Multi-store support operations and AI automation."
        action={<Link href="/customer-care/inbox"><Button>Open Inbox</Button></Link>}
      />

      <StatGrid columns={4}>
        <StatCard label="Open Conversations" value={loading ? '...' : stats?.openConversations?.toString() || '0'} />
        <StatCard label="Human Takeovers" value={loading ? '...' : stats?.humanTakeover?.toString() || '0'} />
        <StatCard label="Open Tickets" value={loading ? '...' : stats?.openTickets?.toString() || '0'} />
        <StatCard label="Active Channels" value="1" />
      </StatGrid>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 p-6 bg-slate-900/40 border-slate-800">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Service Operations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {menuItems.map((item) => (
                <Link key={item.title} href={item.href}>
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group h-full">
                    <div className="text-2xl mb-3 group-hover:scale-110 transition-transform">{item.icon}</div>
                    <h3 className="text-md font-bold text-slate-100 mb-1">{item.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                    </div>
                </Link>
                ))}
            </div>
        </Card>

        <Card className="p-6 bg-amber-500/5 border-amber-500/20 flex flex-col justify-between">
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">💰</span>
                    <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest">AI Sales</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Revenue Influenced</p>
                        <p className="text-2xl font-black text-white">£{loading ? '...' : (stats?.conversionsToday * 15 || 0).toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Upsell Conversion</p>
                        <p className="text-xl font-bold text-emerald-400">{loading ? '...' : (stats?.recommendationsToday > 0 ? ((stats?.conversionsToday / stats?.recommendationsToday) * 100).toFixed(1) : '0.0')}%</p>
                    </div>
                </div>
            </div>
            <Link href="/customer-care/analytics">
                <Button variant="secondary" className="w-full text-xs mt-6 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-200">
                    Sales Insights
                </Button>
            </Link>
        </Card>
      </div>
    </div>
  );
}
