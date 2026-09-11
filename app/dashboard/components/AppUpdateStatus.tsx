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

export default function AppUpdateStatus() {
  const [mode, setMode] = useState<'detecting' | 'web' | 'native'>('detecting');
  const [nativeVersion, setNativeVersion] = useState<NativeVersion>({ legacy: false, versionCode: 0, versionName: '' });
  const [latest, setLatest] = useState<LatestUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const updateRequired = useMemo(() => {
    if (mode !== 'native' || !latest) return false;
    return nativeVersion.legacy || latest.versionCode > nativeVersion.versionCode;
  }, [mode, latest, nativeVersion]);

  const openUpdate = () => {
    if (!latest?.downloadUrl) return;
    const opened = getUpdateBridge()?.openExternalUrl?.(latest.downloadUrl);
    if (!opened) window.open(latest.downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const handleClick = () => {
    if (!loading && latest && (updateRequired || mode === 'web')) {
      openUpdate();
      return;
    }
    if (!loading) void check();
  };

  const label = loading
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

  const Icon = loading
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
          disabled={loading}
          title={title}
          aria-label={label}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black shadow-lg transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${tone}`}
        >
          <Icon size={15} className={loading ? 'animate-spin' : ''} />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
