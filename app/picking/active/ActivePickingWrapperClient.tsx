'use client';

import { Suspense, useEffect } from 'react';
import ActivePickingClient from './ActivePickingClient';

/**
 * Android WebView can expose CentralHub's native TTS bridge without exposing
 * the browser SpeechSynthesis API. Active picking has legacy cleanup code that
 * calls speechSynthesis.cancel() while leaving the page; without this guard the
 * successful final CONFIRM can therefore throw during unmount and land in the
 * global Application Error boundary even though the order already moved to
 * packing.
 *
 * Only install the compatibility surface inside the native CentralHub shell.
 * Normal browsers keep their real SpeechSynthesis implementation untouched.
 */
function NativePickingSpeechCleanupGuard() {
  useEffect(() => {
    const nativeWindow = window as typeof window & {
      CentralHubNative?: {
        speakTara?: (text: string, languageTag: string) => boolean;
        stopTaraTts?: () => void;
      };
      speechSynthesis?: SpeechSynthesis;
    };

    if (nativeWindow.speechSynthesis || !nativeWindow.CentralHubNative?.speakTara) return;

    const compatibilitySpeechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices: () => [] as SpeechSynthesisVoice[],
      cancel: () => {
        try { nativeWindow.CentralHubNative?.stopTaraTts?.(); } catch { /* native cleanup is best-effort */ }
      },
      pause: () => undefined,
      resume: () => undefined,
      speak: () => undefined,
    } as unknown as SpeechSynthesis;

    try {
      Object.defineProperty(nativeWindow, 'speechSynthesis', {
        configurable: true,
        value: compatibilitySpeechSynthesis,
      });
    } catch {
      try {
        (nativeWindow as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis = compatibilitySpeechSynthesis;
      } catch {
        // The active picker still has the native TTS bridge. If a vendor locks
        // the property completely, do not break the page while trying to shim it.
      }
    }
  }, []);

  return null;
}

export default function ActivePickingWrapperClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>}>
      <NativePickingSpeechCleanupGuard />
      <ActivePickingClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}
