'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';

declare global {
  interface Window {
    CentralHubNative?: {
      getFcmToken?: () => string;
      getPlatform?: () => string;
      getAppId?: () => string;
      getVersionCode?: () => number;
      getVersionName?: () => string;
      openExternalUrl?: (url: string) => boolean;
    };
  }
}

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

export default function AppUpdateStatus() {
  const [mode, setMode] = useState<'detecting' | 'web' | 'native'>('detecting');
  const [nativeVersion, setNativeVersion] = useState<NativeVersion>({ legacy: false, versionCode: 0, versionName: '' });
  const [latest, setLatest] = useState<LatestUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    const bridge = typeof window !== 'undefined' ? window.CentralHubNative : undefined;
    const appId = bridge?.getAppId?.() || '';
    if (appId !== 'com.centralhub.network') {
      setMode('web');
      return;
    }

    const legacy = typeof bridge?.getVersionCode !== 'function';
    const versionCode = legacy ? 0 : Number(bridge?.getVersionCode?.() || 0);
    const versionName = legacy ? 'Legacy shell' : String(bridge?.getVersionName?.() || 'Unknown');
    setNativeVersion({ legacy, versionCode, versionName });
    setMode('native');
    setLoading(true);
    setError('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to check Android updates.');

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
    // The native bridge and installed app version are stable for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRequired = useMemo(() => {
    if (mode !== 'native' || !latest) return false;
    return nativeVersion.legacy || latest.versionCode > nativeVersion.versionCode;
  }, [mode, latest, nativeVersion]);

  if (mode === 'detecting' || mode === 'web') return null;

  const openUpdate = () => {
    if (!latest?.downloadUrl) return;
    const opened = window.CentralHubNative?.openExternalUrl?.(latest.downloadUrl);
    if (!opened) window.location.assign(latest.downloadUrl);
  };

  const tone = error
    ? 'border-rose-500/40 bg-rose-500/10'
    : updateRequired
      ? 'border-amber-400/50 bg-amber-400/10 shadow-[0_0_24px_rgba(251,191,36,0.10)]'
      : 'border-emerald-500/30 bg-emerald-500/10';

  return (
    <div className="px-3 pt-3 md:px-5 md:pt-4">
      <section className={`mx-auto max-w-[1600px] rounded-2xl border ${tone} px-4 py-3`} aria-label="CentralHub Android app update status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 rounded-xl p-2 ${updateRequired ? 'bg-amber-400/15 text-amber-300' : error ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
              {updateRequired ? <TriangleAlert size={19} /> : error ? <Smartphone size={19} /> : <CheckCircle2 size={19} />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-slate-100">CentralHub Android</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${updateRequired ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : error ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                  {loading ? 'checking' : updateRequired ? 'update available' : error ? 'check failed' : 'up to date'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Installed: <span className="font-bold text-slate-200">{nativeVersion.versionName}{nativeVersion.versionCode ? ` · ${nativeVersion.versionCode}` : ''}</span>
                {latest && <> · Latest: <span className="font-bold text-slate-200">v{latest.versionName} · {latest.versionCode}</span></>}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Website, dashboard, database and API changes arrive automatically. This alert appears only when the Android shell itself has a newer build.
              </p>
              {nativeVersion.legacy && latest && <p className="mt-1 text-[11px] font-semibold text-amber-200">One update enables permanent installed-version detection inside the app.</p>}
              {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void check()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Check
            </button>
            {updateRequired && latest && (
              <button type="button" onClick={openUpdate} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/10">
                <Download size={15} />
                UPDATE APP
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
