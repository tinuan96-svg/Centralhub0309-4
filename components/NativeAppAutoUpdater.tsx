'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export type NativeUpdateStatus = {
  state: 'checking' | 'current' | 'available' | 'pending' | 'running' | 'paused' | 'downloaded' | 'permission' | 'installing' | 'failed';
  versionCode?: number; versionName?: string; installedVersionCode?: number;
  downloadId?: number; progress?: number; bytes?: number; totalBytes?: number; reason?: number; message?: string;
};
type NativeUpdateBridge = {
  getAppId?: () => string;
  getVersionCode?: () => number;
  startAppUpdateDownload?: (url: string, versionName: string) => number;
  getAppUpdateDownloadStatus?: (id: number) => string;
  cancelAppUpdateDownload?: (id: number) => boolean;
  canInstallAppUpdatesAutomatically?: () => boolean;
  installAppUpdate?: (id: number) => boolean;
};
type Latest = { versionCode: number; versionName: string; downloadUrl: string };
const EVENT = 'centralhub:native-update-status';
const COMMAND = 'centralhub:native-update-command';
const ACTIVE_KEY = 'centralhub:native-active-download-v2';
const STATUS_KEY = 'centralhub:native-update-state-v2';
const STALL_MS = 120_000;
const CHECK_MS = 5 * 60_000;
const ATTEMPT_MS = 30 * 60_000;
const getBridge = () => (window as typeof window & { CentralHubNative?: NativeUpdateBridge }).CentralHubNative;

export default function NativeAppAutoUpdater() {
  const activeRef = useRef<{ id: number; versionCode: number; versionName: string; lastBytes: number; lastProgressAt: number } | null>(null);
  const readyRef = useRef<number | null>(null);
  const latestRef = useRef<Latest | null>(null);
  const installingRef = useRef(false);

  useEffect(() => {
    let closed = false, checking = false, pollTimer: number | null = null, checkTimer: number | null = null;
    const bridge = getBridge();
    if (bridge?.getAppId?.() !== 'com.centralhub.network' || !bridge.getVersionCode || !bridge.startAppUpdateDownload || !bridge.getAppUpdateDownloadStatus) return;

    const emit = (detail: NativeUpdateStatus) => {
      if (closed) return;
      try { sessionStorage.setItem(STATUS_KEY, JSON.stringify(detail)); } catch {}
      window.dispatchEvent(new CustomEvent<NativeUpdateStatus>(EVENT, { detail }));
    };
    const clearPoll = () => { if (pollTimer !== null) window.clearInterval(pollTimer); pollTimer = null; };
    const release = (cancel = false) => {
      const old = activeRef.current;
      clearPoll();
      if (cancel && old) bridge.cancelAppUpdateDownload?.(old.id);
      activeRef.current = null;
      readyRef.current = null;
      installingRef.current = false;
      try { sessionStorage.removeItem(ACTIVE_KEY); } catch {}
    };
    const fail = (message: string, cancel = false) => {
      release(cancel);
      emit({ state: 'failed', ...(latestRef.current ? { versionCode: latestRef.current.versionCode, versionName: latestRef.current.versionName } : {}), message });
    };
    const tryInstall = (requestPermission = false) => {
      if (closed || readyRef.current === null || installingRef.current) return;
      if (!bridge.installAppUpdate) { fail('This app version cannot install the downloaded APK. Use the release download link.'); return; }
      if (bridge.canInstallAppUpdatesAutomatically?.() !== true) {
        if (requestPermission) bridge.installAppUpdate(readyRef.current);
        emit({ state:'permission', downloadId:readyRef.current, message:'Android requires permission to install this update. Tap Install, allow this source and return.' });
        return;
      }
      installingRef.current = true;
      const opened = bridge.installAppUpdate(readyRef.current);
      if (!opened) { installingRef.current = false; emit({ state:'failed', downloadId:readyRef.current, message:'Android could not open the installer. Tap Install to retry, or use the release download link.' }); return; }
      emit({ state:'installing', downloadId:readyRef.current, progress:100, message:'Update downloaded. Confirm installation if Android asks.' });
    };
    const watch = () => {
      if (closed || !activeRef.current) return;
      const a = activeRef.current;
      let status: { status?: string; progress?: number; reason?: number; bytes?: number; totalBytes?: number };
      try { status = JSON.parse(bridge.getAppUpdateDownloadStatus!(a.id) || '{}'); }
      catch { fail('Android update status could not be read. Tap Retry.', true); return; }
      const state = String(status.status || 'unknown');
      const bytes = Number(status.bytes || 0), totalBytes = Number(status.totalBytes || 0);
      const progress = Number.isFinite(Number(status.progress)) ? Math.max(0, Math.min(100, Number(status.progress))) : 0;
      if (bytes > a.lastBytes || progress > 0 && bytes === 0) { a.lastBytes = bytes; a.lastProgressAt = Date.now(); }
      if (state === 'successful') {
        clearPoll();
        readyRef.current = a.id;
        emit({ state:'downloaded', downloadId:a.id, versionCode:a.versionCode, versionName:a.versionName, progress:100, bytes, totalBytes });
        tryInstall();
        return;
      }
      if (state === 'failed' || state === 'missing' || state === 'invalid') {
        fail('Android DownloadManager reported ' + state + (status.reason ? ' (reason ' + status.reason + ')' : '') + '. Tap Retry or open the direct APK link.', false);
        return;
      }
      if (!['pending', 'running', 'paused'].includes(state)) { fail('Unknown Android download state. Tap Retry.', true); return; }
      if (Date.now() - a.lastProgressAt > STALL_MS) {
        fail('Update download stalled for two minutes' + (status.reason ? ' (Android reason ' + status.reason + ')' : '') + '. Tap Retry or open the APK link.', true);
        return;
      }
      emit({ state: state as 'pending'|'running'|'paused', downloadId:a.id, versionCode:a.versionCode, versionName:a.versionName, progress, bytes, totalBytes, reason:status.reason });
    };
    const start = (target: Latest) => {
      if (activeRef.current || readyRef.current !== null) return;
      const id = Number(bridge.startAppUpdateDownload?.(target.downloadUrl, target.versionName) || -1);
      if (!Number.isSafeInteger(id) || id <= 0) { fail('Android could not start the APK download. Use the direct release link.'); return; }
      activeRef.current = { id, versionCode:target.versionCode, versionName:target.versionName, lastBytes:0, lastProgressAt:Date.now() };
      try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(activeRef.current)); localStorage.setItem('centralhub:auto-native-update:' + target.versionCode, String(Date.now())); } catch {}
      emit({ state:'pending', versionCode:target.versionCode, versionName:target.versionName, downloadId:id, progress:0 });
      watch();
      clearPoll();
      pollTimer = window.setInterval(watch, 1000);
    };
    const check = async (force = false) => {
      if (closed || checking || activeRef.current || readyRef.current !== null) return;
      const current = Number(bridge.getVersionCode?.() || 0);
      if (!Number.isFinite(current) || current <= 0) return;
      checking = true;
      emit({ state:'checking', installedVersionCode:current });
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) throw new Error('Sign in to check for Android updates.');
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        let response: Response;
        try { response = await fetch('/api/app-update', { headers:{ Authorization:'Bearer ' + data.session.access_token }, cache:'no-store', signal:controller.signal }); }
        finally { window.clearTimeout(timeout); }
        const body = await response.json().catch(() => null) as { success?: boolean; latest?: Latest | null; error?: string } | null;
        if (!response.ok || !body?.success) throw new Error(body?.error || 'Update feed unavailable (HTTP ' + response.status + ')');
        latestRef.current = body.latest || null;
        if (!body.latest || body.latest.versionCode <= current) {
          emit({ state:'current', installedVersionCode:current, versionCode:body.latest?.versionCode });
          return;
        }
        const target = body.latest;
        emit({ state:'available', installedVersionCode:current, versionCode:target.versionCode, versionName:target.versionName });
        let recent = false;
        try { recent = Date.now() - Number(localStorage.getItem('centralhub:auto-native-update:' + target.versionCode) || 0) < ATTEMPT_MS; } catch {}
        if (force || !recent) start(target);
      } catch (error) {
        emit({ state:'failed', message:error instanceof Error ? error.message : 'Update check failed. Tap Retry.' });
      } finally { checking = false; }
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null');
      if (saved && Number.isSafeInteger(saved.id) && saved.id > 0) {
        activeRef.current = { id:saved.id, versionCode:saved.versionCode, versionName:saved.versionName, lastBytes:Number(saved.lastBytes||0), lastProgressAt:Date.now() };
        watch();
        if (activeRef.current) pollTimer = window.setInterval(watch, 1000);
      }
    } catch {}
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (command === 'install') { installingRef.current = false; tryInstall(true); }
      else if (command === 'retry') { release(true); void check(true); }
      else if (command === 'check') void check(true);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (readyRef.current !== null) { installingRef.current = false; tryInstall(); }
      else if (!activeRef.current) void check();
    };
    window.addEventListener(COMMAND, onCommand);
    document.addEventListener('visibilitychange', onVisible);
    if (!activeRef.current) void check();
    checkTimer = window.setInterval(() => void check(), CHECK_MS);
    return () => {
      closed = true;
      clearPoll();
      if (checkTimer !== null) window.clearInterval(checkTimer);
      window.removeEventListener(COMMAND, onCommand);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
