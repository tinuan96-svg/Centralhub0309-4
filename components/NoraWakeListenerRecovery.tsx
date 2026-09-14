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
 * Only coordinates the exceptional Picking microphone hand-off.
 *
 * MainActivity already owns the normal Shruthi recognizer lifecycle. Calling
 * setTaraEnabled(true) on every Next.js route/focus/pageshow event could restart
 * Samsung SpeechRecognizer exactly when a page changed, which is what produced
 * the loud paired start/stop tones reported on the Fold. Ordinary navigation now
 * leaves the recognizer completely untouched.
 */
export default function NoraWakeListenerRecovery() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const bridge = getWakeBridge();
    let available = false;
    try {
      available = bridge?.getPlatform?.() === 'android' && bridge?.isTaraVoiceAvailable?.() === true;
    } catch {
      available = false;
    }
    if (!available || !bridge?.setTaraEnabled) return;

    const clearRecovery = () => {
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    };

    const previousPath = previousPathRef.current ?? readLastWakeRoute();
    const pickingNow = isPickingRoute(pathname);
    const justLeftPicking = Boolean(previousPath && isPickingRoute(previousPath) && !pickingNow);

    if (pickingNow) {
      clearRecovery();
      // Picking intentionally needs exclusive microphone ownership.
      try { bridge.setTaraEnabled(false); } catch { }
    } else if (justLeftPicking) {
      // This is the only route transition allowed to touch the passive listener.
      // Wait for the picking recognizer/audio focus to release, then resume once.
      clearRecovery();
      recoveryTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'hidden' || isPickingRoute(window.location.pathname)) return;
        try { bridge.setTaraEnabled?.(true); } catch { }
      }, 700);
    }

    // Initial mount and every ordinary section/page navigation intentionally do
    // nothing. The native Android activity keeps Shruthi alive itself.
    previousPathRef.current = pathname;
    saveLastWakeRoute(pathname);

    return () => {
      clearRecovery();
      // Never disable the native listener during route cleanup.
    };
  }, [pathname]);

  return null;
}
