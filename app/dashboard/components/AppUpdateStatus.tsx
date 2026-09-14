'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type UpdateBridge = {
  getAppId?: () => string;
  getFcmToken?: () => string;
  getPlatform?: () => string;
  getVersionCode?: () => number;
  getVersionName?: () => string;
  startAppUpdateDownload?: (url: string, versionName: string) => number;
  getAppUpdateDownloadStatus?: (downloadId: number) => string;
  canInstallAppUpdatesAutomatically?: () => boolean;
  installAppUpdate?: (downloadId: number) => boolean;
  openExternalUrl?: (url: string) => boolean;
};

type LatestUpdate = {
  versionName: string;
  versionCode: number;
  tag: string;
  publishedAt: string | null;
  downloadUrl: string;
  releaseUrl: string;
  notes: string;
};

type UpdateFeed = {
  success: boolean;
  latest: LatestUpdate | null;
  error?: string;
};

type NativeVersion = {
  legacy: boolean;
  versionCode: number;
  versionName: string;
};

function getUpdateBridge(): UpdateBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: UpdateBridge }).CentralHubNative;
}

function autoAttemptKey(versionCode: number) {
  return `centralhub:auto-native-update:${versionCode}`;
}

export default function AppUpdateStatus() {
  const [mode, setMode] = useState<'detecting' | 'web' | 'native'>('detecting');
  const [nativeVersion, setNativeVersion] = useState<NativeVersion>({ legacy: false, versionCode: 0, versionName: '' });
  const [latest, setLatest] = useState<LatestUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadId, setDownloadId] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);

  const check = async () => {
    const bridge = getUpdateBridge();
    const appId = bridge?.getAppId?.() || '';
    const native = appId === 'com.centralhub.network';
    const legacy = native && typeof bridge?.getVersionCode !== 'function';
    const versionCode = native ? (legacy ? 0 : Number(bridge?.getVersionCode?.() || 0)) : 0;
    const versionName = native ? (legacy ? 'Legacy shell' : String(bridge?.getVersionName?.() || 'Unknown')) : '';

    if (native) {
      setNativeVersion({ legacy, versionCode, versionName });
      setMode('native');
    } else {
      setNativeVersion({ legacy: false, versionCode: 0, versionName: '' });
      setMode('web');
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to check Android updates.');

      if (native) {
        const fcmToken = String(bridge?.getFcmToken?.() || '').trim();
        if (fcmToken) {
          void fetch('/api/push/native', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: fcmToken,
              platform: bridge?.getPlatform?.() || 'android',
              appId: 'com.centralhub.network',
              deviceName: navigator.userAgent.slice(0, 160),
              appVersionCode: versionCode,
              appVersionName: versionName,
            }),
          }).catch(() => undefined);
        }
      }

      const response = await fetch('/api/app-update', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as UpdateFeed | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Could not check app updates (HTTP ${response.status}).`);
      }
      setLatest(payload.latest || null);
    } catch (e: any) {
      setError(e?.message || 'Could not check Android updates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!downloadId) return;
    const bridge = getUpdateBridge();
    if (!bridge?.getAppUpdateDownloadStatus) return;
    let timer: number | undefined;
    const poll = () => {
      try {
        const raw = bridge.getAppUpdateDownloadStatus?.(downloadId) || '';
        const payload = JSON.parse(raw) as { status?: string; progress?: number };
        const status = String(payload.status || 'unknown');
        setDownloadStatus(status);
        setDownloadProgress(Math.max(0, Math.min(100, Number(payload.progress || 0))));
        if (status === 'successful') {
          if (timer) window.clearInterval(timer);
          const opened = bridge.installAppUpdate?.(downloadId) === true;
          if (!opened) setError('Update downloaded. Android may ask once for “Allow from this source”. Enable it, return to CentralHub, and the same update will continue automatically.');
        } else if (status === 'failed' || status === 'missing') {
          if (timer) window.clearInterval(timer);
          setError('Android update download failed. CentralHub will retry on the next update check.');
        }
      } catch {
        // Keep polling transient native status failures.
      }
    };
    poll();
    timer = window.setInterval(poll, 700);
    return () => { if (timer) window.clearInterval(timer); };
  }, [downloadId]);

  const updateRequired = useMemo(() => {
    if (mode !== 'native' || !latest) return false;
    return nativeVersion.legacy || latest.versionCode > nativeVersion.versionCode;
  }, [mode, latest, nativeVersion]);

  const openUpdate = () => {
    if (!latest?.downloadUrl) return;
    const bridge = getUpdateBridge();

    if (mode === 'native' && bridge?.startAppUpdateDownload) {
      if (downloadStatus === 'successful' && downloadId && bridge.installAppUpdate) {
        const opened = bridge.installAppUpdate(downloadId);
        if (!opened) setError('Allow CentralHub to install app updates in Android settings, then return here.');
        return;
      }
      const id = Number(bridge.startAppUpdateDownload(latest.downloadUrl, latest.versionName) || -1);
      if (id > 0) {
        setError('');
        setDownloadId(id);
        setDownloadStatus('pending');
        setDownloadProgress(0);
        return;
      }
      setError('Could not start the in-app Android download.');
      return;
    }

    // Existing app shells need one final external download. After the native
    // updater is installed, future APK updates stay inside CentralHub.
    const opened = bridge?.openExternalUrl?.(latest.downloadUrl);
    if (!opened) window.open(latest.downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const downloading = downloadStatus === 'pending' || downloadStatus === 'running' || downloadStatus === 'paused';

  // New updater-enabled Android builds download a newer signed APK automatically.
  // A per-version guard prevents route remounts or visibility changes from creating
  // duplicate DownloadManager jobs. Older installed shells keep the manual button.
  useEffect(() => {
    if (mode !== 'native' || !updateRequired || !latest || downloadId || downloading) return;
    const bridge = getUpdateBridge();
    if (!bridge?.startAppUpdateDownload || typeof bridge.canInstallAppUpdatesAutomatically !== 'function') return;

    const key = autoAttemptKey(latest.versionCode);
    try {
      const lastAttempt = Number(localStorage.getItem(key) || 0);
      if (Number.isFinite(lastAttempt) && lastAttempt > 0 && Date.now() - lastAttempt < 30 * 60 * 1000) return;
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage is only a duplicate guard; automatic updating can still proceed.
    }

    const id = Number(bridge.startAppUpdateDownload(latest.downloadUrl, latest.versionName) || -1);
    if (id > 0) {
      setError('');
      setDownloadId(id);
      setDownloadStatus('pending');
      setDownloadProgress(0);
    } else {
      setError('Automatic Android update download could not start. You can tap the update button to retry.');
    }
  }, [mode, updateRequired, latest, downloadId, downloading]);

  // If Android opened the one-time "Install unknown apps" permission screen,
  // resume the already-downloaded update when the user returns to CentralHub.
  useEffect(() => {
    if (!downloadId || downloadStatus !== 'successful') return;
    const bridge = getUpdateBridge();
    if (!bridge?.installAppUpdate) return;
    const retry = () => {
      if (document.visibilityState !== 'visible') return;
      if (bridge.canInstallAppUpdatesAutomatically?.() === true) {
        setError('');
        bridge.installAppUpdate?.(downloadId);
      }
    };
    document.addEventListener('visibilitychange', retry);
    window.addEventListener('focus', retry);
    return () => {
      document.removeEventListener('visibilitychange', retry);
      window.removeEventListener('focus', retry);
    };
  }, [downloadId, downloadStatus]);

  const handleClick = () => {
    if (!loading && latest && (updateRequired || mode === 'web')) {
      openUpdate();
      return;
    }
    if (!loading) void check();
  };

  const label = downloading
    ? `Updating ${downloadProgress}%`
    : loading
      ? 'Checking Android app…'
    : updateRequired
      ? 'Update Android app'
      : error
        ? 'Check Android app'
        : mode === 'native'
          ? 'Android app up to date'
          : latest
            ? 'Download Android app'
            : 'Check Android app';

  const title = error
    ? error
    : mode === 'native'
      ? `Installed ${nativeVersion.versionName || 'unknown'}${nativeVersion.versionCode ? ` (${nativeVersion.versionCode})` : ''}${latest ? ` · Latest ${latest.versionName} (${latest.versionCode})` : ''}`
      : latest
        ? `Latest CentralHub Android ${latest.versionName} (${latest.versionCode})`
        : 'Check the latest CentralHub Android version';

  const tone = updateRequired
    ? 'border-amber-300/50 bg-amber-400 text-slate-950 shadow-amber-500/10'
    : error
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
      : mode === 'native'
        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
        : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200';

  const Icon = downloading || loading
    ? RefreshCw
    : updateRequired
      ? Download
      : error
        ? TriangleAlert
        : mode === 'native'
          ? CheckCircle2
          : Smartphone;

  return (
    <div className="px-3 pt-2 md:px-5 md:pt-3">
      <div className="mx-auto flex max-w-[1600px] justify-end">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading || downloading}
          title={title}
          aria-label={label}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black shadow-lg transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${tone}`}
        >
          <Icon size={15} className={loading || downloading ? 'animate-spin' : ''} />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
