'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type WakeBridge = {
  getPlatform?: () => string;
  isTaraVoiceAvailable?: () => boolean;
  setTaraEnabled?: (enabled: boolean) => void;
};

const LAST_WAKE_ROUTE_KEY = 'centralhub:shruthi:last-wake-route';

function getWakeBridge(): WakeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { CentralHubNative?: WakeBridge }).CentralHubNative;
}

function isPickingRoute(pathname: string) {
  return pathname.startsWith('/picking/active');
}

function readLastWakeRoute() {
  try { return sessionStorage.getItem(LAST_WAKE_ROUTE_KEY); } catch { return null; }
}

function saveLastWakeRoute(pathname: string) {
  try { sessionStorage.setItem(LAST_WAKE_ROUTE_KEY, pathname); } catch { /* best effort */ }
}

/**
 * Keeps the Android SHRUTHI passive wake listener healthy around the picking
 * microphone hand-off. Normal route navigation must never do an Off -> On reset:
 * Samsung SpeechRecognizer can emit a pair of loud system beeps when cancelled
 * and restarted. A hard re-arm is reserved only for leaving the picking route,
 * where microphone ownership really changed.
 */
export default function NoraWakeListenerRecovery() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const bridge = getWakeBridge();
    let available = false;
    try {
      available = bridge?.getPlatform?.() === 'android' && bridge?.isTaraVoiceAvailable?.() === true;
    } catch {
      available = false;
    }
    if (!available || !bridge?.setTaraEnabled) return;

    const clearTimers = () => {
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      recoveryTimerRef.current = null;
      settleTimerRef.current = null;
    };

    const softEnable = () => {
      if (document.visibilityState === 'hidden' || isPickingRoute(window.location.pathname)) return;
      try { bridge.setTaraEnabled?.(true); } catch { /* best-effort native recovery */ }
    };

    const hardRearm = () => {
      if (document.visibilityState === 'hidden' || isPickingRoute(window.location.pathname)) return;
      clearTimers();
      try { bridge.setTaraEnabled?.(false); } catch { /* continue with delayed enable */ }
      recoveryTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'hidden' || isPickingRoute(window.location.pathname)) return;
        try { bridge.setTaraEnabled?.(true); } catch { /* best-effort native recovery */ }
        // One later idempotent enable lets Samsung release the picking recognizer
        // and audio focus without repeatedly cycling the recognizer on normal pages.
        settleTimerRef.current = window.setTimeout(softEnable, 1400);
      }, 650);
    };

    // usePathname consumers can be remounted by layout boundaries. Persisting the
    // last route in sessionStorage prevents a remount from looking like a cold start
    // and accidentally hard-rearming the recognizer on every section navigation.
    const previousPath = previousPathRef.current ?? readLastWakeRoute();
    const pickingNow = isPickingRoute(pathname);
    const justLeftPicking = Boolean(previousPath && isPickingRoute(previousPath) && !pickingNow);

    if (pickingNow) {
      clearTimers();
      try { bridge.setTaraEnabled(false); } catch { /* picking hook also owns this hand-off */ }
    } else if (justLeftPicking) {
      hardRearm();
    } else {
      // Initial mount and ordinary CentralHub page changes are intentionally soft.
      // This keeps passive wake alive without Samsung's cancel/start system beeps.
      softEnable();
    }
    previousPathRef.current = pathname;
    saveLastWakeRoute(pathname);

    const onVisible = () => {
      if (document.visibilityState === 'visible') softEnable();
    };
    const onFocus = () => softEnable();
    const onPageShow = () => softEnable();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      clearTimers();
      // Do not disable the native listener here. CentralHubVoiceAssistant owns
      // the global assistant lifecycle; route cleanup must never leave wake off.
    };
  }, [pathname]);

  return null;
}
