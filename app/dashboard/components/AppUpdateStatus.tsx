'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { NativeUpdateStatus } from '@/components/NativeAppAutoUpdater';

type Bridge = {
  getAppId?: () => string; getVersionCode?: () => number; getVersionName?: () => string;
  openExternalUrl?: (url: string) => boolean;
};
type Release = { versionName: string; versionCode: number; downloadUrl: string; releaseUrl: string };
type Feed = { success: boolean; latest: Release | null; error?: string };
const STATUS_EVENT = 'centralhub:native-update-status';
const COMMAND_EVENT = 'centralhub:native-update-command';
const KEY = 'centralhub:native-update-state-v2';
const getBridge = () => (window as typeof window & { CentralHubNative?: Bridge }).CentralHubNative;

export default function AppUpdateStatus() {
  const [native, setNative] = useState(false);
  const [installed, setInstalled] = useState<{ code: number; name: string }>({ code:0, name:'' });
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<NativeUpdateStatus>({ state:'checking' });
  const [fetchError, setFetchError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const bridge = getBridge();
    setNative(bridge?.getAppId?.() === 'com.centralhub.network');
    setInstalled({ code:Number(bridge?.getVersionCode?.() || 0), name:String(bridge?.getVersionName?.() || '') });
    try { const last = sessionStorage.getItem(KEY); if (last) setState(JSON.parse(last) as NativeUpdateStatus); } catch {}
    const onStatus = (event: Event) => setState((event as CustomEvent<NativeUpdateStatus>).detail);
    window.addEventListener(STATUS_EVENT, onStatus);
    return () => window.removeEventListener(STATUS_EVENT, onStatus);
  }, []);

  useEffect(() => {
    let active = true;
    const getLatest = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Sign in to check Android updates.');
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        let response: Response;
        try { response = await fetch('/api/app-update', { headers:{ Authorization:'Bearer ' + token }, cache:'no-store', signal:controller.signal }); }
        finally { window.clearTimeout(timeout); }
        const body = await response.json().catch(() => null) as Feed | null;
        if (!response.ok || !body?.success) throw new Error(body?.error || 'Update feed unavailable (HTTP ' + response.status + ')');
        if (!active) return;
        setRelease(body.latest || null);
        setFetchError('');
      } catch (err) { if (active) setFetchError(err instanceof Error ? err.message : 'Update check failed'); }
      finally { if (active) setLoading(false); }
    };
    void getLatest();
    const onVisible = () => { if (document.visibilityState === 'visible') void getLatest(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(getLatest, 5 * 60_000);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [clock]);

  const hasUpdate = !!release && (!native || release.versionCode > installed.code);
  const busy = ['checking','pending','running','paused'].includes(state.state);
  const currentDownload = ['pending','running','paused','downloaded','permission','installing'].includes(state.state);
  const isDownloading = ['pending','running','paused'].includes(state.state);
  const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));
  const bytes = Number(state.bytes || 0);
  const totalBytes = Number(state.totalBytes || 0);
  const measured = totalBytes > 0;
  const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';
  const label = !native ? release ? 'Download Android app' : loading ? 'Checking Android…' : 'Check Android app' :
    isDownloading ? state.state === 'paused' ? 'Download paused' : measured ? 'Downloading ' + progress + '%' : bytes > 0 ? 'Downloading ' + mb(bytes) : state.state === 'pending' ? 'Waiting to download' : 'Connecting to download…' :
    state.state === 'downloaded' || state.state === 'permission' ? 'Install downloaded update' :
    state.state === 'installing' ? 'Confirm Android installation' :
    state.state === 'failed' || fetchError ? 'Retry Android update' :
    hasUpdate ? 'Update Android app' : state.state === 'checking' || loading ? 'Checking Android app…' : 'Android app up to date';
  const command = (action: string) => window.dispatchEvent(new CustomEvent(COMMAND_EVENT,{detail:{action}}));
  const openRelease = () => {
    if (!release?.downloadUrl) return;
    if (getBridge()?.openExternalUrl?.(release.downloadUrl)) return;
    window.open(release.downloadUrl, '_blank', 'noopener,noreferrer');
  };
  const click = () => {
    if (!native) { if (release?.downloadUrl) openRelease(); else setClock(c => c+1); return; }
    if (isDownloading || state.state === 'installing') return;
    if (state.state === 'downloaded' || state.state === 'permission') { command('install'); return; }
    command(state.state === 'failed' || hasUpdate ? 'retry' : 'check');
    setClock(c=>c+1);
  };
  const info = fetchError || state.message ||
    (state.state === 'paused' ? 'Android has paused the download' + (state.reason ? ' · reason ' + state.reason : '') : '') ||
    (isDownloading ? measured ? mb(bytes) + ' of ' + mb(totalBytes) : bytes > 0 ? mb(bytes) + ' downloaded; total size not reported yet' : 'Waiting for Android DownloadManager' : '') ||
    (native ? 'Installed ' + (installed.name || installed.code || 'unknown') + (release ? ' · Latest ' + release.versionName : '') : 'CentralHub Android release');
  const error = state.state === 'failed' || !!fetchError;
  const Icon = error ? TriangleAlert : isDownloading || loading ? RefreshCw : !hasUpdate && native ? CheckCircle2 : native ? Download : Smartphone;

  return <div className="px-3 pt-2 md:px-5 md:pt-3">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-end gap-2">
      {error && release?.downloadUrl && <button type="button" onClick={openRelease} className="rounded-lg border border-slate-600/70 px-3 py-2 text-xs font-semibold text-cyan-200" title="Download exact signed APK directly">Direct APK</button>}
      <button type="button" onClick={click} disabled={isDownloading || state.state === 'installing' || loading && !release}
        title={info} aria-label={label}
        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-sm ${error ? 'border-rose-400/50 bg-rose-900/30 text-rose-100' : currentDownload || hasUpdate ? 'border-amber-400/50 bg-amber-400 text-slate-950' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'} disabled:opacity-80`}>
        <Icon size={15} className={isDownloading && state.state !== 'paused' || loading && !release ? 'animate-spin' : ''} />
        <span>{label}</span>
      </button>
      {(error || currentDownload) && <span role={error ? 'alert' : 'status'} className="w-full text-right text-[11px] text-slate-400">{info}</span>}
    </div>
  </div>;
}
