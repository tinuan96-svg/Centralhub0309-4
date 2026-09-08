'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { readReportRows } from '@/lib/dashboard/reporting';
import { DonutChart, Panel } from '@/components/dashboard/Charts';

export default function CommunicationAnalytics() {
  const [stats, setStats] = useState<{ open: number; human: number; resolved: number; inbound: number; outbound: number } | null>(null);
  const [error, setError] = useState(false);
  const { selectedStoreId } = useDashboardFilterStore();
  useEffect(() => {
    let cancelled = false; setStats(null); setError(false);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const scope = (q: any) => selectedStoreId === 'all' ? q : q.eq('store_id', selectedStoreId);
    Promise.all([
      readReportRows(() => scope(supabase.from('whatsapp_conversations').select('id,status,handling_mode').order('id')), 'Conversations'),
      readReportRows(() => scope(supabase.from('support_tickets').select('id,resolved_at').gte('resolved_at', today.toISOString()).order('id')), 'Resolved tickets'),
      readReportRows(() => {
        let q = supabase.from('whatsapp_messages').select('id,direction,whatsapp_conversations!inner(store_id)').gte('created_at', today.toISOString()).order('id');
        if (selectedStoreId !== 'all') q = q.eq('whatsapp_conversations.store_id', selectedStoreId);
        return q;
      }, 'Messages'),
    ]).then(([convs, tickets, messages]) => { if (!cancelled) setStats({ open: convs.filter(c => c.status === 'open').length, human: convs.filter(c => c.status === 'open' && c.handling_mode === 'HUMAN').length, resolved: tickets.length, inbound: messages.filter(m => m.direction === 'inbound').length, outbound: messages.filter(m => m.direction === 'outbound').length }); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [selectedStoreId]);
  return <Panel title="Customer communications" subtitle="Current conversations and today's message activity." action={<Link href="/customer-care/inbox" className="ch-link">Open inbox →</Link>}>
    {error ? <p role="alert" className="ch-note ch-error">Message statistics could not be loaded.</p> : !stats ? <p className="ch-muted">Loading messages…</p> : <>
      <div className="grid grid-cols-3 gap-3 mb-6">{[['Open enquiries', stats.open], ['With admin', stats.human], ['Tickets resolved today', stats.resolved]].map(([label, value]) => <div key={label}><p className="ch-muted">{label}</p><p className="ch-kpi-value mt-2">{value}</p></div>)}</div>
      <DonutChart data={[{ label: 'Received today', value: stats.inbound, color: '#67e8f9' }, { label: 'Sent today', value: stats.outbound, color: '#a78bfa' }]} label="messages" />
      <Link href="/customer-care/channels" className="ch-link mt-5">Review channel connections →</Link>
    </>}
  </Panel>;
}
