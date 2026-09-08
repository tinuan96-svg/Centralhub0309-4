'use client';

import { useState, useEffect } from 'react';
import { NotificationService, SystemNotification } from '@/lib/services/system/notificationService';
import Link from 'next/link';
import { getStoreNotificationBrand } from '@/lib/notifications/storeNotificationBrand';

export default function NotificationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) loadNotifications();
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    const data = await NotificationService.getNotifications();
    setNotifications(data);
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    await NotificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-full right-0 mt-2 w-[min(92vw,24rem)] bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
        <h3 className="text-xs font-black text-white uppercase tracking-widest">Notifications</h3>
        <div className="flex gap-2">
          <button onClick={handleMarkAllRead} className="text-[9px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-tighter">Mark all read</button>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-2">✕</button>
        </div>
      </div>

      <div className="max-h-[min(60vh,400px)] overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center"><p className="text-slate-600 font-bold uppercase tracking-widest text-[10px]">All clear</p><p className="text-[10px] text-slate-700 mt-1 uppercase">No new alerts</p></div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {notifications.map(n => {
              const storeSlug = typeof n.metadata?.store_slug === 'string' ? n.metadata.store_slug : null;
              const storeName = typeof n.metadata?.store_name === 'string' ? n.metadata.store_name : null;
              const storeBrand = getStoreNotificationBrand(storeSlug, storeName);
              const storeLogo = typeof n.metadata?.store_logo_url === 'string'
                ? n.metadata.store_logo_url
                : storeSlug ? storeBrand.webIcon : null;

              return (
              <div key={n.id} className={`p-4 flex gap-4 transition-colors relative ${n.is_read ? 'opacity-60' : 'bg-blue-500/5'}`} onClick={() => !n.is_read && handleMarkRead(n.id)}>
                {!n.is_read && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden ${n.severity === 'critical' ? 'bg-rose-900/20 border-rose-500/30 text-rose-400' : n.severity === 'warning' ? 'bg-amber-900/20 border-amber-500/30 text-amber-400' : 'bg-blue-900/20 border-blue-500/30 text-blue-400'}`}>
                  {storeLogo
                    ? <img src={storeLogo} alt={storeBrand.name} className="w-full h-full object-cover" />
                    : n.category === 'inventory' ? '📦' : n.category === 'order' ? '🛒' : n.category === 'support' ? '🎫' : '⚙️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-100 uppercase tracking-tight truncate">{n.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-3 leading-relaxed">{n.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {n.action_url && <Link href={n.action_url} className="text-[8px] font-black text-cyan-500 hover:text-cyan-400 uppercase tracking-widest" onClick={onClose}>View Details →</Link>}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 bg-slate-950/50 border-t border-slate-800 text-center"><Link href="/settings/notifications" className="text-[9px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-[0.2em]" onClick={onClose}>Notification Settings</Link></div>
    </div>
  );
}
