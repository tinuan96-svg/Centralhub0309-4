import { useState, useEffect, useCallback, useRef } from 'react';

export interface VoicePickingControls {
  isListening: boolean;
  isSpeaking: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  lastCommand: string | null;
  error: string | null;
}

const PICKING_COMMAND_HINT = /\b(?:picked|pick|picket|pecked|packed|pic|done|finish|finished|complete|completed|confirm|confirmed|yes|yeah|yep|okay|ok|next|skip|back|previous|repeat|pause|resume|continue|stop)\b/i;
const PICKED_HOMOPHONE_HINT = /\b(?:picked|pick|picket|pecked|packed|pic)\b/i;

function normalizePickingTranscript(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\b(?:picked it|pick it|picket|pecked|packed)\b/g, 'picked')
    .replace(/\bpic\b/g, 'pick')
    .replace(/\s+/g, ' ');
}

function chooseBestPickingTranscript(result: any) {
  if (!result || typeof result.length !== 'number' || result.length === 0) return '';

  let bestText = String(result[0]?.transcript || '').trim();
  let bestScore = Number(result[0]?.confidence || 0);

  for (let index = 0; index < result.length; index += 1) {
    const alternative = result[index];
    const text = String(alternative?.transcript || '').trim();
    if (!text) continue;

    let score = Number(alternative?.confidence || 0);
    if (PICKING_COMMAND_HINT.test(text)) score += 2;
    if (PICKED_HOMOPHONE_HINT.test(text)) score += 3;
    if (/\b(?:picked|pick)\b/i.test(text)) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  return normalizePickingTranscript(bestText);
}

export function useVoicePicking(onCommand: (command: string) => void): VoicePickingControls {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onCommandRef = useRef(onCommand);
  // isListeningRef is the user's desired state. recognitionActiveRef tracks whether
  // Android/WebView has actually opened the microphone. Keeping these separate stops
  // the UI claiming "Listening" before SpeechRecognition.onstart really fires.
  const isListeningRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const appBackgroundedRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativePickingExclusiveRef = useRef(false);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        setVoices(window.speechSynthesis.getVoices());
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const setSpeakingState = useCallback((value: boolean) => {
    isSpeakingRef.current = value;
    setIsSpeaking(value);
  }, []);

  const restartRecognitionAfterSpeech = useCallback((delayMs = 450) => {
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);

    const attemptStart = () => {
      if (!isListeningRef.current) return;

      // Android tears down Web Speech when the WebView loses foreground. Never try
      // to reopen the microphone while hidden; doing so produces a misleading
      // SpeechRecognition "network" error and can leave the UI stuck OFF on resume.
      if (appBackgroundedRef.current || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
        recognitionActiveRef.current = false;
        setIsListening(false);
        return;
      }

      const browserSpeaking = Boolean(synthRef.current?.speaking);
      if (isSpeakingRef.current || browserSpeaking) {
        restartTimeoutRef.current = setTimeout(attemptStart, 250);
        return;
      }

      const recognition = recognitionRef.current;
      if (!recognition) return;

      try {
        recognition.start();
      } catch (e) {
        // Android WebView can still be releasing the native wake recognizer/audio
        // focus. Retry automatically instead of requiring the user to toggle Off/On.
        console.warn('[Voice] Recognition start deferred:', e);
        restartTimeoutRef.current = setTimeout(attemptStart, 350);
        return;
      }

      if (recognitionStartWatchdogRef.current) clearTimeout(recognitionStartWatchdogRef.current);
      recognitionStartWatchdogRef.current = setTimeout(() => {
        if (!isListeningRef.current || recognitionActiveRef.current || appBackgroundedRef.current) return;
        console.warn('[Voice] Recognition did not become active; recycling recognizer');
        setIsListening(false);
        try { recognition.abort?.(); } catch (e) {
          try { recognition.stop?.(); } catch (stopError) {}
        }
        restartTimeoutRef.current = setTimeout(attemptStart, 400);
      }, 1600);
    };

    restartTimeoutRef.current = setTimeout(attemptStart, delayMs);
  }, []);

  const initRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('not-supported');
      return;
    }

    if (recognitionStartWatchdogRef.current) {
      clearTimeout(recognitionStartWatchdogRef.current);
      recognitionStartWatchdogRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {}
    }

    recognitionActiveRef.current = false;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';
    // Short warehouse commands are easy for Android to confuse. Ask for several
    // candidates and pick the one that best matches the known picking vocabulary.
    try { recognition.maxAlternatives = 5; } catch (e) {}

    recognition.onstart = () => {
      console.log('[Voice] Started listening');
      recognitionActiveRef.current = true;
      if (recognitionStartWatchdogRef.current) {
        clearTimeout(recognitionStartWatchdogRef.current);
        recognitionStartWatchdogRef.current = null;
      }
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const result = event?.results?.[event.resultIndex ?? 0] || event?.results?.[0];
      const transcript = chooseBestPickingTranscript(result);
      if (!transcript) return;

      console.log('[Voice] Result:', transcript);

      setLastCommand(transcript);
      onCommandRef.current(transcript);

      setTimeout(() => {
        setLastCommand(current => current === transcript ? null : current);
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error);

      const backgrounded = appBackgroundedRef.current
        || (typeof document !== 'undefined' && document.visibilityState !== 'visible');

      if (event.error === 'no-speech' || event.error === 'aborted') return;

      // Chromium commonly reports "network" when Android suspends a foreground
      // speech session during app switching. That is lifecycle noise, not a real
      // connectivity failure, so keep the user's listening intent and recover when
      // the app becomes visible again.
      if (backgrounded && event.error === 'network') {
        recognitionActiveRef.current = false;
        setIsListening(false);
        setError(null);
        return;
      }

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Check microphone permissions',
        'network': 'Network error during recognition',
        'audio-capture': 'No microphone found'
      };

      setError(errorMessages[event.error] || event.error);

      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        isListeningRef.current = false;
        recognitionActiveRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      console.log('[Voice] Recognition ended');
      recognitionActiveRef.current = false;

      if (isListeningRef.current && !appBackgroundedRef.current) {
        restartRecognitionAfterSpeech(350);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [restartRecognitionAfterSpeech]);

  useEffect(() => {
    let disposed = false;

    const requestScreenWakeLock = async () => {
      if (disposed || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (wakeLockRef.current) return;

      try {
        const wakeLockApi = (navigator as any)?.wakeLock;
        if (!wakeLockApi?.request) return;
        const lock = await wakeLockApi.request('screen');
        if (disposed) {
          try { await lock.release?.(); } catch (e) {}
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener?.('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
        console.log('[Voice] Screen wake lock active for picking');
      } catch (wakeError) {
        // Screen Wake Lock is best-effort. Picking still works when the API is not
        // available, and visibility recovery below restores recognition after unlock.
        console.warn('[Voice] Screen wake lock unavailable:', wakeError);
      }
    };

    const suspendPickingForBackground = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

      appBackgroundedRef.current = true;
      recognitionActiveRef.current = false;
      setIsListening(false);
      // Backgrounding a WebView may surface a synthetic "network" error from Web
      // Speech. Clear it immediately so the warehouse operator never sees a false
      // connectivity warning after switching back from another app.
      setError(null);

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (recognitionStartWatchdogRef.current) {
        clearTimeout(recognitionStartWatchdogRef.current);
        recognitionStartWatchdogRef.current = null;
      }

      if (recognitionRef.current) {
        try { recognitionRef.current.abort?.(); } catch (e) {
          try { recognitionRef.current.stop?.(); } catch (stopError) {}
        }
      }

      if (wakeLockRef.current) {
        try { void wakeLockRef.current.release?.(); } catch (e) {}
        wakeLockRef.current = null;
      }
    };

    const resumePickingAfterVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      const returningFromBackground = appBackgroundedRef.current;
      appBackgroundedRef.current = false;
      setError(null);
      void requestScreenWakeLock();

      // Recreate Web Speech after an Android app switch. Reusing Chromium's stale
      // recognition object is what caused the red NETWORK ERROR / OFF state shown on
      // Samsung devices after returning to the picking screen.
      if (isListeningRef.current) {
        if (returningFromBackground || !recognitionRef.current) initRecognition();
        setIsListening(false);
        restartRecognitionAfterSpeech(returningFromBackground ? 850 : 500);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumePickingAfterVisibility();
      else suspendPickingForBackground();
    };

    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis || null;

      // Active picking owns the microphone while this hook is mounted. The Android
      // shell normally keeps NORA/Shruthi's passive on-device recognizer running;
      // two recognizers competing for the same microphone makes very short commands
      // such as "picked" unreliable on Samsung devices. Pause the passive listener
      // for the picking session, then restore it when the user leaves picking.
      const nativeBridge = (window as any).CentralHubNative;
      if (nativeBridge?.setTaraEnabled) {
        try {
          nativeBridge.setTaraEnabled(false);
          // The installed Android bridge only permits speakTara() while its Nora
          // conversation flag is active. Pausing the wake listener above clears
          // that flag AND mutes WebView speech. Restore voice output for this
          // picking-only session without re-enabling the competing recognizer.
          // Keep this compatibility path for already-installed Android builds.
          nativeBridge.setNoraConversationActive?.(true);
          nativePickingExclusiveRef.current = true;
          console.log('[Voice] Native wake listener paused; picking speech output enabled');
        } catch (nativeError) {
          console.warn('[Voice] Could not pause native wake listener:', nativeError);
        }
      }

      void requestScreenWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', resumePickingAfterVisibility);
      window.addEventListener('pageshow', resumePickingAfterVisibility);
      window.addEventListener('pagehide', suspendPickingForBackground);
    }

    return () => {
      disposed = true;
      isListeningRef.current = false;
      recognitionActiveRef.current = false;
      isSpeakingRef.current = false;
      appBackgroundedRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch(e) {}
      }
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionStartWatchdogRef.current) clearTimeout(recognitionStartWatchdogRef.current);
      if (speechCompletionTimerRef.current) clearTimeout(speechCompletionTimerRef.current);
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', resumePickingAfterVisibility);
        window.removeEventListener('pageshow', resumePickingAfterVisibility);
        window.removeEventListener('pagehide', suspendPickingForBackground);
        try { window.speechSynthesis?.cancel(); } catch (e) {}
        try { (window as any).CentralHubNative?.stopTaraTts?.(); } catch (e) {}
        if (nativePickingExclusiveRef.current) {
          // Leave no residual voice-assistant session after leaving picking.
          try { (window as any).CentralHubNative?.setNoraConversationActive?.(false); } catch (e) {}
          try { (window as any).CentralHubNative?.setTaraEnabled?.(true); } catch (e) {}
          nativePickingExclusiveRef.current = false;
        }
      }
      if (wakeLockRef.current) {
        try { void wakeLockRef.current.release?.(); } catch (e) {}
        wakeLockRef.current = null;
      }
      utteranceRef.current = null;
    };
  }, [initRecognition, restartRecognitionAfterSpeech]);

  const startListening = useCallback(() => {
    console.log('[Voice] startListening called');
    setError(null);
    isListeningRef.current = true;
    appBackgroundedRef.current = typeof document !== 'undefined' && document.visibilityState !== 'visible';

    const rec = initRecognition();
    if (!rec) {
      isListeningRef.current = false;
      recognitionActiveRef.current = false;
      setIsListening(false);
      return;
    }

    // Do not open the recognizer while the initial item prompt is still speaking.
    // This was the startup race that made the button appear enabled but required an
    // Off -> On toggle before Android actually delivered transcripts.
    setIsListening(false);
    restartRecognitionAfterSpeech(180);
  }, [initRecognition, restartRecognitionAfterSpeech]);

  const stopListening = useCallback(() => {
    console.log('[Voice] stopListening called');
    isListeningRef.current = false;
    recognitionActiveRef.current = false;
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    if (recognitionStartWatchdogRef.current) clearTimeout(recognitionStartWatchdogRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    const speech = text.trim();
    if (!speech) return;

    console.log('[Voice] Speaking:', speech);

    const wasListening = isListeningRef.current;
    if (wasListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    if (recognitionStartWatchdogRef.current) clearTimeout(recognitionStartWatchdogRef.current);
    if (speechCompletionTimerRef.current) clearTimeout(speechCompletionTimerRef.current);

    const finishSpeech = () => {
      if (speechCompletionTimerRef.current) {
        clearTimeout(speechCompletionTimerRef.current);
        speechCompletionTimerRef.current = null;
      }
      utteranceRef.current = null;
      setSpeakingState(false);
      // The user may have enabled listening while TTS was already in progress.
      // Always honor the current intent, not only the state captured before speech.
      if (isListeningRef.current) restartRecognitionAfterSpeech();
    };

    setSpeakingState(true);

    // CentralHub's Android shell already has a native TextToSpeech engine. Prefer it
    // because Android WebView/Samsung devices can expose speech recognition while
    // silently refusing browser speechSynthesis playback.
    const nativeBridge = (window as any).CentralHubNative;
    if (nativeBridge?.speakTara) {
      try {
        const accepted = Boolean(nativeBridge.speakTara(speech, 'en-GB'));
        if (accepted) {
          const wordCount = Math.max(1, speech.split(/\s+/).length);
          const estimatedMs = Math.min(9000, Math.max(1800, Math.round((wordCount / 2.6) * 1000) + 900));
          speechCompletionTimerRef.current = setTimeout(finishSpeech, estimatedMs);
          return;
        }
      } catch (nativeError) {
        console.warn('[Voice] Native TTS unavailable, using browser fallback:', nativeError);
      }
    }

    const synth = synthRef.current || window.speechSynthesis;
    if (!synth) {
      setError('Voice output unavailable');
      finishSpeech();
      return;
    }

    synthRef.current = synth;
    try {
      synth.cancel();
      synth.resume();
    } catch (e) {}

    // Some Android WebViews expose speechSynthesis but not its utterance constructor.
    // A missing browser TTS API must never crash the order picking screen.
    const Utterance = (window as typeof window & { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
    if (typeof Utterance !== 'function') {
      setError('Voice output unavailable');
      finishSpeech();
      return;
    }
    const utterance = new Utterance(speech);
    utterance.lang = 'en-GB';

    const femaleVoice = voices.find(v =>
      (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google UK English Female')) &&
      v.lang.startsWith('en')
    ) || voices.find(v => v.lang.toLowerCase().startsWith('en-gb'))
      || voices.find(v => v.lang.toLowerCase().startsWith('en'))
      || voices[0];

    if (femaleVoice) utterance.voice = femaleVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1.02;

    utterance.onstart = () => setSpeakingState(true);
    utterance.onend = finishSpeech;
    utterance.onerror = (event: any) => {
      const code = event?.error || 'unknown';
      if (code !== 'interrupted' && code !== 'canceled') {
        console.error('[Voice] Browser TTS error:', code);
        setError('Voice output unavailable');
      }
      finishSpeech();
    };

    utteranceRef.current = utterance;

    // Keep a watchdog because some Android WebViews accept speak() but never emit
    // onstart/onend. Holding the utterance ref also prevents premature GC.
    const wordCount = Math.max(1, speech.split(/\s+/).length);
    const watchdogMs = Math.min(11000, Math.max(3000, Math.round((wordCount / 2.3) * 1000) + 2500));
    speechCompletionTimerRef.current = setTimeout(() => {
      try { synth.resume(); } catch (e) {}
      finishSpeech();
    }, watchdogMs);

    try {
      synth.speak(utterance);
    } catch (speechError) {
      console.error('[Voice] Browser TTS failed:', speechError);
      setError('Voice output unavailable');
      finishSpeech();
    }
  }, [voices, restartRecognitionAfterSpeech, setSpeakingState]);

  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    lastCommand,
    error
  };
}
