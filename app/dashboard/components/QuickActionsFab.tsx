'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import {
  DEFAULT_QUICK_ACTION_IDS,
  getQuickActions,
  QUICK_ACTION_STORAGE_KEY,
  type QuickAction,
} from '@/lib/quickActions';

const money = (value: number) => `£${value.toFixed(2)}`;

export default function QuickActionsFab() {
  const { selectedStore } = useStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shortcutIds, setShortcutIds] = useState(DEFAULT_QUICK_ACTION_IDS);
  const [todaySales, setTodaySales] = useState<number | null>(null);
  const [todayOrders, setTodayOrders] = useState(0);
  const [supportAlerts, setSupportAlerts] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(QUICK_ACTION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setShortcutIds(parsed);
      }
    } catch {
      // Keep safe defaults.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const loadTodaySales = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      let query = supabase
        .from('orders')
        .select('total, order_status')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .not('order_status', 'in', '(cancelled,refunded,failed)');

      if (selectedStore?.id) query = query.eq('store_id', selectedStore.id);

      const { data, error } = await query;
      if (cancelled || error) return;
      const rows = data || [];
      setTodayOrders(rows.length);
      setTodaySales(rows.reduce((sum, row: any) => sum + Number(row.total || 0), 0));
    };

    loadTodaySales();
    return () => { cancelled = true; };
  }, [selectedStore?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadSupportAlerts = async () => {
      let query = supabase
        .from('system_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('category', 'support');
      if (selectedStore?.id) query = query.eq('store_id', selectedStore.id);
      const { count, error } = await query;
      if (!cancelled && !error) setSupportAlerts(count || 0);
    };

    loadSupportAlerts();
    const channel = supabase
      .channel(`quick_actions_support_${Math.random().toString(36).slice(2, 9)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_notifications' }, loadSupportAlerts)
      .subscribe();

    const interval = window.setInterval(loadSupportAlerts, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [selectedStore?.id]);

  const actions = useMemo(() => getQuickActions(shortcutIds), [shortcutIds]);

  if (!mounted) return null;

  return (
    <div ref={panelRef} className="fixed z-[70] right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6">
      {open && (
        <div
          className="absolute bottom-[4.25rem] right-0 w-[min(92vw,420px)] max-h-[min(70vh,560px)] overflow-y-auto rounded-3xl border border-slate-700/70 bg-slate-950/98 shadow-2xl shadow-black/50 backdrop-blur-xl p-3 overscroll-contain"
          role="menu"
          aria-label="Quick actions"
        >
          <div className="flex items-center justify-between px-2 py-2 mb-1">
            <div>
              <p className="text-[9px] uppercase tracking-[.2em] font-black text-cyan-400">Quick access</p>
              <h2 className="text-base font-black text-white">Frequently used</h2>
            </div>
            <Link href="/settings#quick-shortcuts" onClick={() => setOpen(false)} className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-white hover:border-cyan-500/40">Edit</Link>
          </div>

          {supportAlerts > 0 && (
            <Link
              href="/customer-care/tickets"
              onClick={() => setOpen(false)}
              className="mb-3 flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 touch-manipulation active:scale-[.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white font-black">!</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-rose-200">CUSTOMER SUPPORT NEEDS ATTENTION</span>
                <span className="block text-[10px] text-rose-300/80 mt-0.5">{supportAlerts} unread support alert{supportAlerts === 1 ? '' : 's'} — open tickets</span>
              </span>
              <span className="text-rose-300 text-sm">→</span>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-2">
            {actions.map((action: QuickAction) => (
              <Link key={action.id} href={action.href} onClick={() => setOpen(false)} className="min-h-[78px] rounded-2xl border border-slate-800 bg-slate-900/80 p-3 flex flex-col justify-between active:scale-[.98] hover:border-cyan-500/40 hover:bg-slate-900 transition-all touch-manipulation" role="menuitem">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl leading-none" aria-hidden>{action.icon}</span>
                  {action.id === 'todays-sales' && todaySales !== null && <span className="text-[10px] font-black text-emerald-400">{money(todaySales)}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-white truncate">{action.label}</p>
                  <p className="text-[9px] text-slate-500 truncate mt-0.5">{action.id === 'todays-sales' && todaySales !== null ? `${todayOrders} order${todayOrders === 1 ? '' : 's'} today` : action.description}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-3 px-2 py-2 rounded-2xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-500">Shortcuts can be added, removed and reordered in Settings.</div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close quick actions' : 'Open quick actions'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`relative h-14 w-14 rounded-full text-white shadow-2xl border-2 border-white/15 flex items-center justify-center active:scale-95 transition-all touch-manipulation ${open ? 'bg-slate-700 rotate-45' : 'bg-cyan-500 shadow-cyan-900/40'}`}
      >
        <span className="text-3xl leading-none font-light" aria-hidden>+</span>
        {!open && supportAlerts > 0 && (
          <span className="absolute -right-1 -top-1 min-w-6 h-6 px-1 rounded-full bg-rose-500 border-2 border-slate-950 text-[10px] font-black flex items-center justify-center text-white shadow-lg" aria-label={`${supportAlerts} support alerts`}>
            {supportAlerts > 99 ? '99+' : supportAlerts}
          </span>
        )}
      </button>
    </div>
  );
}
