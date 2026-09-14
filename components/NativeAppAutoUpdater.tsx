'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type NativeUpdateBridge = {
  getAppId?: () => string;
  getVersionCode?: () => number;
  startAppUpdateDownload?: (url: string, versionName: string) => number;
  getAppUpdateDownloadStatus?: (downloadId: number) => string;
  canInstallAppUpdatesAutomatically?: () => boolean;
  installAppUpdate?: (downloadId: number) => boolean;
};

type UpdateFeed = {
  success?: boolean;
  latest?: {
    versionName?: string;
    versionCode?: number;
    downloadUrl?: string;
  } | null;
};

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_ATTEMPT_WINDOW_MS = 30 * 60 * 1000;

function getBridge(): NativeUpdateBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { CentralHubNative?: NativeUpdateBridge }).CentralHubNative;
}

function attemptKey(versionCode: number) {
  return `centralhub:auto-native-update:${versionCode}`;
}

/**
 * Keeps the installed Android shell current from every CentralHub route.
 *
 * Web/dashboard changes already arrive through Netlify without an APK install.
 * When a native Android release is newer, an updater-capable shell downloads it
 * in the background and hands it to Android's package installer. Android can
 * still require its one-time "Install unknown apps" permission or a system
 * confirmation; after that permission screen the same downloaded APK resumes.
 */
export default function NativeAppAutoUpdater() {
  const activeDownloadRef = useRef<number | null>(null);
  const readyToInstallRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let checkTimer: number | null = null;

    const clearPoll = () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };

    const tryInstall = () => {
      if (disposed) return;
      const downloadId = readyToInstallRef.current;
      const bridge = getBridge();
      if (!downloadId || !bridge?.installAppUpdate) return;

      try {
        const permitted = bridge.canInstallAppUpdatesAutomatically?.() === true;
        const opened = bridge.installAppUpdate(downloadId) === true;
        // If permission is missing, installAppUpdate opens Android's one-time
        // permission screen. Keep the id so the focus handler can resume it.
        if (permitted && opened) {
          readyToInstallRef.current = null;
          activeDownloadRef.current = null;
        }
      } catch {
        // A later visibility/focus event or scheduled check will retry safely.
      }
    };

    const watchDownload = (downloadId: number) => {
      clearPoll();
      const poll = () => {
        if (disposed) return;
        const bridge = getBridge();
        if (!bridge?.getAppUpdateDownloadStatus) return;
        try {
          const raw = bridge.getAppUpdateDownloadStatus(downloadId) || '';
          const status = JSON.parse(raw) as { status?: string };
          const state = String(status.status || 'unknown');
          if (state === 'successful') {
            clearPoll();
            readyToInstallRef.current = downloadId;
            tryInstall();
          } else if (state === 'failed' || state === 'missing' || state === 'invalid') {
            clearPoll();
            activeDownloadRef.current = null;
          }
        } catch {
          // DownloadManager status can be transient while Android is updating it.
        }
      };
      poll();
      pollTimerRef.current = window.setInterval(poll, 800);
    };

    const checkForUpdate = async () => {
      if (disposed || activeDownloadRef.current !== null || readyToInstallRef.current !== null) return;

      const bridge = getBridge();
      if (
        bridge?.getAppId?.() !== 'com.centralhub.network' ||
        typeof bridge.getVersionCode !== 'function' ||
        typeof bridge.startAppUpdateDownload !== 'function' ||
        typeof bridge.getAppUpdateDownloadStatus !== 'function' ||
        typeof bridge.installAppUpdate !== 'function'
      ) return;

      const installedVersionCode = Number(bridge.getVersionCode() || 0);
      if (!Number.isFinite(installedVersionCode) || installedVersionCode <= 0) return;

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || disposed) return;

        const response = await fetch('/api/app-update', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as UpdateFeed | null;
        const latest = payload?.success ? payload.latest : null;
        const latestVersionCode = Number(latest?.versionCode || 0);
        const downloadUrl = String(latest?.downloadUrl || '').trim();
        const versionName = String(latest?.versionName || 'latest').trim() || 'latest';
        if (!response.ok || !latest || !downloadUrl || latestVersionCode <= installedVersionCode) return;

        const key = attemptKey(latestVersionCode);
        try {
          const lastAttempt = Number(localStorage.getItem(key) || 0);
          if (Number.isFinite(lastAttempt) && lastAttempt > 0 && Date.now() - lastAttempt < AUTO_ATTEMPT_WINDOW_MS) return;
          localStorage.setItem(key, String(Date.now()));
        } catch {
          // Storage is only a duplicate-download guard.
        }

        const downloadId = Number(bridge.startAppUpdateDownload(downloadUrl, versionName) || -1);
        if (downloadId > 0) {
          activeDownloadRef.current = downloadId;
          watchDownload(downloadId);
        }
      } catch {
        // Stay silent in the global shell. The dashboard update control remains
        // available for diagnostics/manual retry if a network request fails.
      }
    };

    const onVisibleOrFocus = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      if (readyToInstallRef.current !== null) tryInstall();
      else void checkForUpdate();
    };

    void checkForUpdate();
    checkTimer = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibleOrFocus);
    window.addEventListener('focus', onVisibleOrFocus);
    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void checkForUpdate(), 250);
    });

    return () => {
      disposed = true;
      clearPoll();
      if (checkTimer !== null) window.clearInterval(checkTimer);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
      window.removeEventListener('focus', onVisibleOrFocus);
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  return null;
}
