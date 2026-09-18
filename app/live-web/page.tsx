'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, Bookmark, BookmarkCheck, Clock3, ExternalLink, Globe2,
  History, Loader2, MonitorCheck, Play, RefreshCw, Search, ShieldCheck,
  Trash2, WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NativeBrowserBridge = {
  getPlatform?: () => string;
  openNoraComputerMode?: (sessionId: string, targetUrl: string, accessToken: string, supabaseUrl: string, publishableKey: string) => boolean;
};

type BookmarkRow = { id: string; title: string; url: string; created_at: string };
type HistoryRow = { id: string; title: string; url: string; visited_at: string };
type MonitorRow = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  interval_minutes: number;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_summary: string | null;
  last_error: string | null;
};
type MonitorEvent = {
  id: string;
  monitor_id: string;
  detected_at: string;
  change_type: string;
  severity: string;
  summary: string;
  metadata: Record<string, unknown> | null;
};

const QUICK_LINKS = [
  ['Meta Business', 'https://business.facebook.com/'],
  ['Google Ads', 'https://ads.google.com/'],
  ['Merchant Center', 'https://merchants.google.com/'],
  ['Google Analytics', 'https://analytics.google.com/'],
  ['Search Console', 'https://search.google.com/search-console/'],
  ['GitHub', 'https://github.com/'],
  ['Netlify', 'https://app.netlify.com/'],
  ['Supabase', 'https://supabase.com/dashboard/'],
  ['Kerala Taste', 'https://keralataste.com/'],
  ['PickEasy', 'https://pickeasy.co.uk/'],
  ['Veenas', 'https://veenas.com/'],
  ['The Indian Shelf', 'https://theindianshelf.co.uk/'],
] as const;

const INTERVALS = [
  [15, '15 min'],
  [30, '30 min'],
  [60, '1 hour'],
  [180, '3 hours'],
  [360, '6 hours'],
  [720, '12 hours'],
  [1440, '24 hours'],
] as const;

function nativeBridge(): NativeBrowserBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBrowserBridge }).CentralHubNative;
}

function normalizeTarget(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Enter a website or search term.');
  if (/\s/.test(value) || (!value.includes('.') && !/^https:\/\//i.test(value))) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
  const normalized = /^https:\/\//i.test(value) ? value : `https://${value.replace(/^http:\/\//i, '')}`;
  const url = new URL(normalized);
  if (url.protocol !== 'https:') throw new Error('Live Web only opens HTTPS websites.');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '::1' ||
    /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)
  ) throw new Error('Local/private network addresses are blocked in Live Web.');
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) {
    throw new Error('Local/private network addresses are blocked in Live Web.');
  }
  return url.toString();
}

function relativeTime(value: string | null) {
  if (!value) return 'Never';
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return 'Unknown';
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export default function LiveWebPage() {
  const [address, setAddress] = useState('https://www.google.com/');
  const [goal, setGoal] = useState('Inspect the starting page, summarize what matters for CentralHub, and wait for my approval before any consequential action.');
  const [busy, setBusy] = useState(false);
  const [stateBusy, setStateBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [monitorInterval, setMonitorInterval] = useState(15);

  const isAndroid = useMemo(() => {
    try { return nativeBridge()?.getPlatform?.() === 'android'; } catch { return false; }
  }, []);

  const loadState = useCallback(async () => {
    setStateBusy(true);
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session?.user) {
      setStateBusy(false);
      return;
    }
    const [bookmarkRes, historyRes, monitorRes, eventRes] = await Promise.all([
      supabase.from('live_web_bookmarks').select('id,title,url,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('live_web_history').select('id,title,url,visited_at').order('visited_at', { ascending: false }).limit(100),
      supabase.from('live_web_monitors').select('id,label,url,enabled,interval_minutes,last_checked_at,last_changed_at,last_summary,last_error').order('created_at', { ascending: false }).limit(100),
      supabase.from('live_web_monitor_events').select('id,monitor_id,detected_at,change_type,severity,summary,metadata').order('detected_at', { ascending: false }).limit(50),
    ]);
    setBookmarks((bookmarkRes.data || []) as BookmarkRow[]);
    setHistory((historyRes.data || []) as HistoryRow[]);
    setMonitors((monitorRes.data || []) as MonitorRow[]);
    setEvents((eventRes.data || []) as MonitorEvent[]);
    setStateBusy(false);
  }, []);

  useEffect(() => {
    void loadState();
    const channel = supabase
      .channel('live-web-control-centre')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_web_bookmarks' }, () => void loadState())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_web_history' }, () => void loadState())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_web_monitors' }, () => void loadState())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_web_monitor_events' }, () => void loadState())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadState]);

  const resolveTarget = () => normalizeTarget(address);

  const launch = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const targetUrl = resolveTarget();
      const bridge = nativeBridge();
      if (bridge?.getPlatform?.() !== 'android' || !bridge.openNoraComputerMode) {
        throw new Error('Live Web requires the latest CentralHub Android app.');
      }
      const { data } = await supabase.auth.getSession();
      const auth = data.session;
      if (!auth?.user || !auth.access_token) throw new Error('Your CentralHub session has expired. Sign in again.');
      const hostname = new URL(targetUrl).hostname;
      const { data: actionSession, error: insertError } = await supabase
        .from('nora_action_sessions')
        .insert({
          user_id: auth.user.id,
          title: `Live Web · ${hostname}`,
          goal: goal.trim() || `Inspect ${hostname} and help the admin with the visible page.`,
          target_system: hostname,
          target_url: targetUrl,
          status: 'planned',
          risk_level: 'medium',
          current_step: `Opening ${hostname}`,
          metadata: { source: 'centralhub_live_web', browser_mode: true },
        })
        .select('id')
        .single();
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create the Live Web session.');

      await supabase.from('live_web_history').insert({
        user_id: auth.user.id,
        url: targetUrl,
        title: hostname,
        source: 'live_web_launcher',
      });

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !publishableKey) throw new Error('CentralHub Supabase client configuration is missing.');
      const launched = bridge.openNoraComputerMode(actionSession.id, targetUrl, auth.access_token, supabaseUrl, publishableKey) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({
          status: 'failed',
          last_error: 'Android Live Web could not launch.',
          completed_at: new Date().toISOString(),
        }).eq('id', actionSession.id);
        throw new Error('Could not open Live Web. Install the latest CentralHub Android update.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not open Live Web.');
    } finally {
      setBusy(false);
    }
  };

  const bookmarkCurrent = async () => {
    setError('');
    setNotice('');
    try {
      const targetUrl = resolveTarget();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error('Sign in again.');
      const existing = bookmarks.find((item) => item.url === targetUrl);
      if (existing) {
        const { error: deleteError } = await supabase.from('live_web_bookmarks').delete().eq('id', existing.id);
        if (deleteError) throw deleteError;
        setNotice('Bookmark removed.');
      } else {
        const { error: insertError } = await supabase.from('live_web_bookmarks').insert({
          user_id: userId,
          url: targetUrl,
          title: new URL(targetUrl).hostname,
        });
        if (insertError) throw insertError;
        setNotice('Bookmark saved.');
      }
      await loadState();
    } catch (e: any) {
      setError(e?.message || 'Could not update bookmark.');
    }
  };

  const monitorCurrent = async () => {
    setError('');
    setNotice('');
    try {
      const targetUrl = resolveTarget();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error('Sign in again.');
      const existing = monitors.find((item) => item.url === targetUrl);
      const payload = {
        user_id: userId,
        url: targetUrl,
        label: new URL(targetUrl).hostname,
        enabled: true,
        interval_minutes: monitorInterval,
        next_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      };
      if (existing) {
        const { error: updateError } = await supabase.from('live_web_monitors').update(payload).eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('live_web_monitors').insert(payload);
        if (insertError) throw insertError;
      }
      setNotice(`24×7 monitoring enabled — checking every ${INTERVALS.find(([v]) => v === monitorInterval)?.[1] || '15 min'}.`);
      await loadState();
    } catch (e: any) {
      setError(e?.message || 'Could not enable monitoring.');
    }
  };

  const setMonitorEnabled = async (row: MonitorRow, enabled: boolean) => {
    const payload: Record<string, unknown> = {
      enabled,
      updated_at: new Date().toISOString(),
    };
    if (enabled) payload.next_check_at = new Date().toISOString();
    await supabase.from('live_web_monitors').update(payload).eq('id', row.id);
    await loadState();
  };

  const updateMonitorInterval = async (row: MonitorRow, interval: number) => {
    await supabase.from('live_web_monitors').update({
      interval_minutes: interval,
      next_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    await loadState();
  };

  const runMonitorNow = async (id: string) => {
    await supabase.from('live_web_monitors').update({ next_check_at: new Date().toISOString() }).eq('id', id);
    setNotice('Monitor queued for the next background worker pass.');
    await loadState();
  };

  const deleteMonitor = async (id: string) => {
    await supabase.from('live_web_monitors').delete().eq('id', id);
    await loadState();
  };

  const clearHistory = async () => {
    await supabase.from('live_web_history').delete().gte('visited_at', '1970-01-01T00:00:00Z');
    await loadState();
  };

  const currentNormalized = (() => {
    try { return normalizeTarget(address); } catch { return ''; }
  })();
  const bookmarked = !!currentNormalized && bookmarks.some((item) => item.url === currentNormalized);
  const monitoring = !!currentNormalized && monitors.some((item) => item.url === currentNormalized && item.enabled);

  return (
    <main className="min-h-full bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl border border-cyan-400/15 bg-slate-900/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300"><Globe2 /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">CentralHub Live Web</h1>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">Isolated</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">A controlled browser + Shruthi computer. Third-party pages stay outside CentralHub’s authenticated main WebView.</p>
            </div>
            <button type="button" onClick={() => void loadState()} className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" title="Refresh Live Web data">
              <RefreshCw className={`h-4 w-4 ${stateBusy ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4 md:p-5">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Website or search</label>
          <div className="mt-2 flex flex-col gap-2 md:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-700 bg-slate-950 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void launch(); }} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" placeholder="Website or search term" />
            </div>
            <button type="button" onClick={() => void launch()} disabled={busy} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open Live Web'}
            </button>
            <button type="button" onClick={() => void bookmarkCurrent()} className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${bookmarked ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-slate-700 text-slate-300'}`}>
              {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{bookmarked ? 'Saved' : 'Bookmark'}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={() => void monitorCurrent()} className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black ${monitoring ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-violet-400/30 bg-violet-400/10 text-violet-200'}`}>
              <MonitorCheck className="h-4 w-4" />{monitoring ? 'Monitoring 24×7' : 'Monitor this 24×7'}
            </button>
            <select value={monitorInterval} onChange={(e) => setMonitorInterval(Number(e.target.value))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-xs text-slate-200">
              {INTERVALS.map(([value, label]) => <option key={value} value={value}>Check every {label}</option>)}
            </select>
            <p className="text-xs text-slate-500">Monitoring runs on CentralHub’s backend. The phone/app does not need to stay open.</p>
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What should Shruthi do?</label>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none" />

          {error && <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {notice && <p className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
          {!isAndroid && <p className="mt-3 text-xs text-amber-300">Open this page inside the latest CentralHub Android app to launch the native Live Web browser.</p>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(([name, url]) => (
            <button key={url} type="button" onClick={() => setAddress(url)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-cyan-400/30 hover:bg-slate-900">
              <div className="flex items-center gap-2 text-sm font-bold"><Globe2 className="h-4 w-4 text-cyan-300" />{name}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{new URL(url).hostname}</div>
            </button>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-black"><BookmarkCheck className="h-4 w-4 text-amber-300" />Bookmarks</h2>
              <span className="text-xs text-slate-500">{bookmarks.length}</span>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {bookmarks.length === 0 ? <p className="text-xs text-slate-500">No bookmarks yet.</p> : bookmarks.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <button type="button" onClick={() => setAddress(item.url)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-bold text-slate-200">{item.title || new URL(item.url).hostname}</div>
                    <div className="truncate text-[11px] text-slate-500">{item.url}</div>
                  </button>
                  <button type="button" onClick={() => { setAddress(item.url); setNotice('Bookmark selected. Tap Open Live Web to launch it.'); }} className="rounded-lg p-2 text-cyan-300 hover:bg-slate-800" title="Select"><ExternalLink className="h-4 w-4" /></button>
                  <button type="button" onClick={async () => { await supabase.from('live_web_bookmarks').delete().eq('id', item.id); await loadState(); }} className="rounded-lg p-2 text-rose-300 hover:bg-slate-800" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-black"><History className="h-4 w-4 text-cyan-300" />History</h2>
              <button type="button" onClick={() => void clearHistory()} className="text-xs font-bold text-slate-500 hover:text-rose-300">Clear</button>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {history.length === 0 ? <p className="text-xs text-slate-500">No Live Web history yet.</p> : history.map((item) => (
                <button key={item.id} type="button" onClick={() => setAddress(item.url)} className="block w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-bold text-slate-200">{item.title || new URL(item.url).hostname}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{relativeTime(item.visited_at)}</span>
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{item.url}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-violet-400/15 bg-slate-900/55 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black"><Activity className="h-5 w-5 text-violet-300" />24×7 Website Monitors</h2>
              <p className="mt-1 text-xs text-slate-500">Baseline → scheduled checks → meaningful-change detection → CentralHub notification.</p>
            </div>
            <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-200">{monitors.filter((m) => m.enabled).length} active</span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {monitors.length === 0 ? <p className="text-xs text-slate-500">No monitored websites yet.</p> : monitors.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setAddress(item.url)} className="min-w-0 text-left">
                    <div className="truncate font-bold text-slate-200">{item.label || new URL(item.url).hostname}</div>
                    <div className="truncate text-[11px] text-slate-500">{item.url}</div>
                  </button>
                  <button type="button" onClick={() => void setMonitorEnabled(item, !item.enabled)} className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${item.enabled ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>{item.enabled ? 'Active' : 'Paused'}</button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-slate-900 p-2"><span className="text-slate-500">Last check</span><div className="font-bold text-slate-300">{relativeTime(item.last_checked_at)}</div></div>
                  <div className="rounded-xl bg-slate-900 p-2"><span className="text-slate-500">Last change</span><div className="font-bold text-slate-300">{relativeTime(item.last_changed_at)}</div></div>
                </div>

                {item.last_summary && <p className="mt-3 text-xs leading-relaxed text-slate-400">{item.last_summary}</p>}
                {item.last_error && <p className="mt-3 flex items-start gap-2 text-xs text-amber-300"><WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.last_error}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <select value={item.interval_minutes} onChange={(e) => void updateMonitorInterval(item, Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
                    {INTERVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" onClick={() => void runMonitorNow(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/20 px-2.5 py-1.5 text-[11px] font-bold text-cyan-300"><Play className="h-3 w-3" />Run now</button>
                  <button type="button" onClick={() => void deleteMonitor(item.id)} className="rounded-lg border border-rose-400/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-300">Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4">
          <h2 className="flex items-center gap-2 font-black"><Clock3 className="h-4 w-4 text-emerald-300" />Recent meaningful changes</h2>
          <div className="mt-3 space-y-2">
            {events.length === 0 ? <p className="text-xs text-slate-500">No meaningful website changes recorded yet.</p> : events.slice(0, 20).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${item.severity === 'warning' ? 'bg-amber-400/10 text-amber-300' : 'bg-cyan-400/10 text-cyan-300'}`}>{item.change_type}</span>
                  <span className="text-[10px] text-slate-600">{relativeTime(item.detected_at)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{item.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
            <div className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck className="h-4 w-4" />Isolated browsing</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Only public HTTPS pages are allowed. Local/private addresses, file access and mixed HTTP content stay blocked.</p>
          </div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4">
            <div className="flex items-center gap-2 font-bold text-violet-200"><Bot className="h-4 w-4" />Shruthi live inspection</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Native Live Web includes tabs, bookmarks, history, monitor controls, Ask/Check, and Take over / Continue. Passwords, OTPs and CAPTCHA remain manual.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
