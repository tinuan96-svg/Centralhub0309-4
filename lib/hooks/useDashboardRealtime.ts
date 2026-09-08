'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const dashboardTables = ['orders', 'order_items', 'products', 'bank_transactions', 'expense_invoices', 'shipments', 'whatsapp_conversations', 'marketing_connections', 'security_events', 'security_heartbeats'] as const;

export function useDashboardRealtime(onChange: () => void) {
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 450); };
    let channel = supabase.channel(`dashboard-live-${Math.random().toString(36).slice(2)}`);
    for (const table of dashboardTables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, changed);
    channel.subscribe(value => setStatus(value === 'SUBSCRIBED' ? 'live' : value === 'CHANNEL_ERROR' || value === 'TIMED_OUT' ? 'offline' : 'connecting'));
    const online = () => { setStatus('connecting'); onChange(); };
    const offline = () => setStatus('offline');
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    const fallback = window.setInterval(onChange, 60000);
    return () => { if (timer) clearTimeout(timer); window.clearInterval(fallback); window.removeEventListener('online', online); window.removeEventListener('offline', offline); void supabase.removeChannel(channel); };
  }, [onChange]);
  return status;
}
