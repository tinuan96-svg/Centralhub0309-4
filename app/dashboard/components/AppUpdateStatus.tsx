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

  const tone = error
    ? 'border-rose-500/40 bg-rose-500/10'
    : updateRequired
      ? 'border-amber-400/50 bg-amber-400/10 shadow-[0_0_24px_rgba(251,191,36,0.10)]'
      : mode === 'native'
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : 'border-cyan-500/30 bg-cyan-500/10';

  const statusLabel = loading
    ? 'checking'
    : updateRequired
      ? 'update available'
      : error
        ? 'check failed'
        : mode === 'native'
          ? 'up to date'
          : 'android update centre';

  return (
    <div className="px-3 pt-3 md:px-5 md:pt-4">
      <section className={`mx-auto max-w-[1600px] rounded-2xl border ${tone} px-4 py-3`} aria-label="CentralHub Android app update status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 rounded-xl p-2 ${updateRequired ? 'bg-amber-400/15 text-amber-300' : error ? 'bg-rose-500/15 text-rose-300' : mode === 'native' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
              {updateRequired ? <TriangleAlert size={19} /> : mode === 'native' && !error ? <CheckCircle2 size={19} /> : <Smartphone size={19} />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-slate-100">CentralHub Android</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${updateRequired ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : error ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : mode === 'native' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}`}>
                  {statusLabel}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-400">
                {mode === 'native' ? (
                  <>Installed: <span className="font-bold text-slate-200">{nativeVersion.versionName}{nativeVersion.versionCode ? ` · ${nativeVersion.versionCode}` : ''}</span></>
                ) : (
                  <>Installed version scan: <span className="font-bold text-cyan-200">open this dashboard inside the CentralHub Android app</span></>
                )}
                {latest && <> · Latest: <span className="font-bold text-slate-200">v{latest.versionName} · {latest.versionCode}</span></>}
              </p>

              <p className="mt-1 text-[11px] text-slate-500">
                Website, dashboard, database and API changes arrive automatically. When a native Android change really needs a new app build, CentralHub creates it and this panel switches to Update Available.
              </p>
              {nativeVersion.legacy && latest && <p className="mt-1 text-[11px] font-semibold text-amber-200">This installed app is an older shell. Install the current build once to enable permanent installed-version detection and future in-dashboard update checks.</p>}
              {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => void check()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Check
            </button>
            {latest && (updateRequired || mode === 'web') && (
              <button type="button" onClick={openUpdate} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black shadow-lg ${updateRequired ? 'border-amber-300/50 bg-amber-400 text-slate-950 shadow-amber-500/10' : 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100 shadow-cyan-500/5'}`}>
                <Download size={15} />
                {updateRequired ? 'UPDATE APP' : 'DOWNLOAD LATEST APK'}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
