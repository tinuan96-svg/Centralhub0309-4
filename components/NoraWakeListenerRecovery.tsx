'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type WakeBridge = {
  getPlatform?: () => string;
  isTaraVoiceAvailable?: () => boolean;
  setTaraEnabled?: (enabled: boolean) => void;
};

function getWakeBridge(): WakeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as typeof window & { CentralHubNative?: WakeBridge }).CentralHubNative;
}

function isPickingRoute(pathname: string) {
  return pathname.startsWith('/picking/active');
}

/**
 * Keeps the Android NORA / SHRUTHI passive wake listener healthy around the
 * picking microphone hand-off. Picking intentionally owns the microphone while
 * active; when that route releases it we do one controlled Off -> On cycle,
 * matching the manual toggle that reliably recovers Samsung SpeechRecognizer.
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
        // A second idempotent enable gives Samsung's recognizer service time to
        // release the picking recognizer/audio focus before passive wake resumes.
        settleTimerRef.current = window.setTimeout(softEnable, 1400);
      }, 650);
    };

    const previousPath = previousPathRef.current;
    const pickingNow = isPickingRoute(pathname);
    const justLeftPicking = Boolean(previousPath && isPickingRoute(previousPath) && !pickingNow);

    if (pickingNow) {
      clearTimers();
      try { bridge.setTaraEnabled(false); } catch { /* picking hook also owns this hand-off */ }
    } else if (previousPath === null || justLeftPicking) {
      hardRearm();
    } else {
      softEnable();
    }
    previousPathRef.current = pathname;

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
