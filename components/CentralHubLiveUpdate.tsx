'use client';

import { useEffect, useRef, useState } from 'react';

type RuntimeVersion = {
  version: string | null;
  tracked: boolean;
  source?: string;
};

const CHECK_INTERVAL_MS = 45_000;

function isCentralHubAndroidApp() {
  if (typeof window === 'undefined') return false;

  try {
    const bridge = (window as any).CentralHubNative;
    return bridge?.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

async function readRuntimeVersion(): Promise<RuntimeVersion | null> {
  try {
    const response = await fetch(`/api/runtime-version?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default function CentralHubLiveUpdate() {
  const loadedVersion = useRef<string | null>(null);
  const [update, setUpdate] = useState<RuntimeVersion | null>(null);

  useEffect(() => {
    if (!isCentralHubAndroidApp()) return;

    let cancelled = false;
    let checking = false;

    const check = async () => {
      if (cancelled || checking || document.visibilityState === 'hidden') return;
      checking = true;

      try {
        const latest = await readRuntimeVersion();
        if (cancelled || !latest?.tracked || !latest.version) return;

        if (!loadedVersion.current) {
          // The first successful request is the deployment that supplied the
          // currently loaded WebView. A later different value means Netlify has
          // switched production to a newer CentralHub deployment.
          loadedVersion.current = latest.version;
          return;
        }

        if (latest.version !== loadedVersion.current) {
          setUpdate(latest);
        }
      } finally {
        checking = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onOnline = () => void check();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
    };
  }, []);

  if (!update?.version) return null;

  const applyUpdate = () => {
    loadedVersion.current = update.version;
    setUpdate(null);
    // CentralHub's Capacitor shell points directly at centralhub.network, so a
    // normal production change is applied by reloading the live WebView rather
    // than downloading and reinstalling another APK.
    window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[120] rounded-2xl border border-cyan-400/30 bg-slate-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl md:inset-x-auto md:bottom-4 md:right-4 md:w-[390px]"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-lg">
          ↻
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">CentralHub update ready</div>
          <div className="mt-0.5 text-xs leading-5 text-slate-300">
            The latest deployed changes are ready. No APK reinstall is needed.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 active:scale-[0.98]"
            >
              Apply now
            </button>
            <button
              type="button"
              onClick={() => setUpdate(null)}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 active:scale-[0.98]"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
