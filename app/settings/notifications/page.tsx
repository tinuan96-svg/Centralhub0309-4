'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NotificationService, SystemNotification } from '@/lib/services/system/notificationService';
import { PushBrowserStatus, PushNotificationService } from '@/lib/services/pushNotificationService';
import { getStoreNotificationBrand } from '@/lib/notifications/storeNotificationBrand';

export default function NotificationSettingsPage() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushBrowserStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const refreshPushStatus = useCallback(async () => {
    const status = await PushNotificationService.getStatus();
    setPushStatus(status);
  }, []);

  useEffect(() => {
    let mounted = true;
    NotificationService.getNotifications(50).then(data => {
      if (mounted) {
        setNotifications(data);
        setLoading(false);
      }
    });
    const channel = NotificationService.subscribeToNotifications((notification) => setNotifications(prev => [notification, ...prev].slice(0, 50)));
    refreshPushStatus();
    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [refreshPushStatus]);

  const unread = notifications.filter(n => !n.is_read).length;

  const markAll = async () => {
    await NotificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const enablePhoneNotifications = async () => {
    setPushLoading(true);
    setPushMessage(null);
    setPushError(null);
    try {
      const status = await PushNotificationService.enable();
      setPushStatus(status);
      setPushMessage('Phone notifications are enabled for this installed CentralHub web app.');
    } catch (error: any) {
      setPushError(error?.message || 'Could not enable phone notifications.');
    } finally {
      setPushLoading(false);
    }
  };

  const sendTestNotification = async () => {
    setPushLoading(true);
    setPushMessage(null);
    setPushError(null);
    try {
      const result = await PushNotificationService.sendTestNotification();
      setPushMessage(`Test sent to ${result.sent || 0} phone subscription(s).`);
      await refreshPushStatus();
    } catch (error: any) {
      setPushError(error?.message || 'Could not send test notification.');
    } finally {
      setPushLoading(false);
    }
  };

  return <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 overflow-x-hidden">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-xl font-black text-white uppercase">Notification Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Live system feed, phone push setup, and read-state controls.</p>
      </div>
      <Link href="/" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold uppercase text-center">Dashboard</Link>
    </div>

    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-white uppercase">Phone push notifications</h2>
          <p className="text-sm text-slate-400 max-w-2xl">Enable this on your Samsung Fold after installing CentralHub from Chrome. New pushed alerts can open the correct CentralHub page directly from the Android notification tray.</p>
        </div>
        <div className="flex flex-col xs:flex-row gap-2">
          <button
            onClick={enablePhoneNotifications}
            disabled={pushLoading || !pushStatus?.supported || !pushStatus?.hasPublicKey}
            className="px-4 py-3 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all"
          >
            {pushLoading ? 'Working…' : pushStatus?.subscribed ? 'Refresh phone setup' : 'Enable phone alerts'}
          </button>
          <button
            onClick={sendTestNotification}
            disabled={pushLoading || !pushStatus?.subscribed}
            className="px-4 py-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-black uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all"
          >
            Send test
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Metric label="Browser support" value={pushStatus?.supported ? 'Ready' : 'Unsupported'} />
        <Metric label="Permission" value={pushStatus?.permission || 'Checking'} />
        <Metric label="Device saved" value={pushStatus?.subscribed ? 'Yes' : 'No'} />
        <Metric label="Server devices" value={pushStatus?.serverSubscriptions ?? '—'} />
      </div>

      {!pushStatus?.hasPublicKey && <Notice type="warning" message="Deployment is missing NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY, so Android phone push cannot be enabled yet." />}
      {pushStatus?.error && <Notice type="warning" message={pushStatus.error} />}
      {pushMessage && <Notice type="success" message={pushMessage} />}
      {pushError && <Notice type="error" message={pushError} />}
    </section>

    <div className="grid md:grid-cols-3 gap-4">
      <Metric label="Loaded notifications" value={notifications.length}/>
      <Metric label="Unread" value={unread}/>
      <Metric label="Realtime" value="Connected"/>
    </div>

    <div className="flex justify-end">
      <button onClick={markAll} disabled={!unread} className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold uppercase disabled:opacity-40">Mark all read</button>
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      {loading ? <div className="p-10 text-center text-slate-500">Loading notifications…</div> : notifications.length === 0 ? <div className="p-12 text-center text-slate-500">No notifications available.</div> : <div className="divide-y divide-slate-800/70">{notifications.map(n => {
        const storeSlug = typeof n.metadata?.store_slug === 'string' ? n.metadata.store_slug : null;
        const storeName = typeof n.metadata?.store_name === 'string' ? n.metadata.store_name : null;
        const storeBrand = getStoreNotificationBrand(storeSlug, storeName);
        const storeLogo = typeof n.metadata?.store_logo_url === 'string'
          ? n.metadata.store_logo_url
          : storeSlug ? storeBrand.webIcon : null;

        return <div key={n.id} className={`p-4 ${n.is_read ? 'opacity-60' : ''}`}>
          <div className="flex justify-between gap-4">
            <div className="flex gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-800 flex items-center justify-center">
                {storeLogo
                  ? <img src={storeLogo} alt={storeBrand.name} className="w-full h-full object-cover" />
                  : <span>🔔</span>}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white">{n.title}</div>
                <div className="text-sm text-slate-400 mt-1">{n.message}</div>
              </div>
            </div>
            <span className="text-[10px] uppercase text-slate-500">{n.severity}</span>
          </div>
        </div>;
      })}</div>}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 min-w-0"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="mt-1 text-xl font-black text-white truncate">{value}</div></div>;
}

function Notice({ type, message }: { type: 'success' | 'warning' | 'error'; message: string }) {
  const tone = type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : type === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>{message}</div>;
}
