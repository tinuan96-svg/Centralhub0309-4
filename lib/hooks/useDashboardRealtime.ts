'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Published tables notify immediately; the foreground check also covers views and
// imports that do not publish events. Keep one dashboard transport and poll timer.
const dashboardTables = new Set(['orders', 'order_items', 'products', 'inventory_movements', 'bank_transactions', 'expense_invoices', 'shipments', 'whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages', 'marketing_connections', 'system_notifications', 'financial_plan_projects', 'financial_plan_milestones', 'security_events', 'security_heartbeats']);
export type DashboardConnection = 'connecting' | 'connected' | 'polling' | 'offline' | 'paused';
export const DASHBOARD_POLL_MS = 30_000;

export function useDashboardRealtime(onChange: () => void) {
  const [status, setStatus] = useState<DashboardConnection>('connecting');
  useEffect(() => {
    let disposed = false;
    let subscribed = false;
    const enabled = () => !disposed && navigator.onLine && document.visibilityState !== 'hidden';
    const updateStatus = () => { if (!disposed) setStatus(!navigator.onLine ? 'offline' : document.visibilityState === 'hidden' ? 'paused' : subscribed ? 'connected' : 'polling'); };
    const changed = () => { if (enabled()) onChange(); };
    // A schema subscription receives only published, authorized records. It avoids
    // binding failures for dashboard sources that are not in the publication.
    const channel = supabase.channel(`dashboard-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        if (dashboardTables.has(payload.table)) changed();
      })
      .subscribe(value => {
        if (disposed) return;
        subscribed = value === 'SUBSCRIBED'; updateStatus();
        if (subscribed) changed();
      });
    const resume = () => { updateStatus(); changed(); };
    const fallback = window.setInterval(resume, DASHBOARD_POLL_MS);
    window.addEventListener('online', resume); window.addEventListener('offline', updateStatus);
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    updateStatus();
    return () => {
      disposed = true; window.clearInterval(fallback); void supabase.removeChannel(channel);
      window.removeEventListener('online', resume); window.removeEventListener('offline', updateStatus);
      window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume);
    };
  }, [onChange]);
  return status;
}
