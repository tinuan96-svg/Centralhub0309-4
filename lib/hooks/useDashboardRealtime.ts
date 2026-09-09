'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Published tables notify immediately; the foreground check also covers views and
// imports that do not publish events. Keep one dashboard transport and poll timer.
const dashboardTables = new Set(['orders', 'order_items', 'products', 'inventory_movements', 'bank_transactions', 'expenses', 'shipments', 'whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages', 'marketing_connections', 'system_notifications', 'financial_plan_projects', 'financial_plan_milestones', 'security_events', 'security_heartbeats']);
export type DashboardConnection = 'connecting' | 'connected' | 'polling' | 'offline' | 'paused';
export const DASHBOARD_POLL_MS = 30_000;

export function useDashboardRealtime(onChange: () => void) {
  const [status, setStatus] = useState<DashboardConnection>('connecting');
  useEffect(() => {
    let disposed = false;
    let subscribed = false;
    let hasEverSubscribed = false;
    const enabled = () => !disposed && navigator.onLine && document.visibilityState !== 'hidden';
    const updateStatus = () => {
      if (disposed) return;
      setStatus(!navigator.onLine ? 'offline' : document.visibilityState === 'hidden' ? 'paused' : subscribed ? 'connected' : 'polling');
    };
    const changed = () => { if (enabled()) onChange(); };

    // One schema subscription keeps the dashboard light while still receiving every
    // published source. Non-published views remain covered by the 30-second check.
    const channel = supabase.channel(`dashboard-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        if (dashboardTables.has(payload.table)) changed();
      })
      .subscribe(value => {
        if (disposed) return;
        subscribed = value === 'SUBSCRIBED';
        if (subscribed) {
          hasEverSubscribed = true;
          changed();
        }
        updateStatus();
      });

    // If the websocket cannot establish, never leave the dashboard looking as if it
    // is still booting. The polling path remains live and retries happen through the
    // Supabase channel transport itself.
    const connectDeadline = window.setTimeout(() => {
      if (!disposed && !subscribed) setStatus(navigator.onLine && document.visibilityState !== 'hidden' ? 'polling' : !navigator.onLine ? 'offline' : 'paused');
    }, 5_000);

    const resume = () => {
      updateStatus();
      changed();
      // A previously healthy connection that dropped while the app was backgrounded
      // should immediately show the polling safety-net until the socket rejoins.
      if (hasEverSubscribed && !subscribed && enabled()) setStatus('polling');
    };
    const fallback = window.setInterval(resume, DASHBOARD_POLL_MS);
    window.addEventListener('online', resume);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    updateStatus();
    return () => {
      disposed = true;
      window.clearTimeout(connectDeadline);
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [onChange]);
  return status;
}
