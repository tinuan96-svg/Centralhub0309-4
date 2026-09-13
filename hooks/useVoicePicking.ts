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

export function useVoicePicking(onCommand: (command: string) => void): VoicePickingControls {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onCommandRef = useRef(onCommand);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    restartTimeoutRef.current = setTimeout(() => {
      if (!isListeningRef.current || isSpeakingRef.current) return;
      try {
        recognitionRef.current?.start();
      } catch (e) {
        // The recognizer may already be starting. Its onend handler will recover it.
        console.warn('[Voice] Resume after speech deferred:', e);
      }
    }, delayMs);
  }, []);

  const initRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('not-supported');
      return;
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

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
      console.log('[Voice] Started listening');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      console.log('[Voice] Result:', transcript);

      setLastCommand(transcript);
      onCommandRef.current(transcript);

      setTimeout(() => {
        setLastCommand(current => current === transcript ? null : current);
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error);

      if (event.error === 'no-speech' || event.error === 'aborted') return;

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Check microphone permissions',
        'network': 'Network error during recognition',
        'audio-capture': 'No microphone found'
      };

      setError(errorMessages[event.error] || event.error);

      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        isListeningRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      console.log('[Voice] Recognition ended');

      if (isListeningRef.current) {
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          const browserSpeaking = Boolean(synthRef.current?.speaking);
          if (isListeningRef.current && !isSpeakingRef.current && !browserSpeaking) {
            console.log('[Voice] Restarting...');
            try {
              recognitionRef.current?.start();
            } catch (e) {
              console.warn('[Voice] Restart failed', e);
            }
          }
        }, 350);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis || null;
    }

    return () => {
      isListeningRef.current = false;
      isSpeakingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch(e) {}
      }
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (speechCompletionTimerRef.current) clearTimeout(speechCompletionTimerRef.current);
      if (typeof window !== 'undefined') {
        try { window.speechSynthesis?.cancel(); } catch (e) {}
        try { (window as any).CentralHubNative?.stopTaraTts?.(); } catch (e) {}
      }
      utteranceRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    console.log('[Voice] startListening called');
    setError(null);
    isListeningRef.current = true;

    const rec = initRecognition();
    if (rec) {
      try {
        rec.start();
        setIsListening(true);
      } catch (err: any) {
        console.warn('[Voice] Start error:', err.message);
      }
    }
  }, [initRecognition]);

  const stopListening = useCallback(() => {
    console.log('[Voice] stopListening called');
    isListeningRef.current = false;
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
    if (speechCompletionTimerRef.current) clearTimeout(speechCompletionTimerRef.current);

    const finishSpeech = () => {
      if (speechCompletionTimerRef.current) {
        clearTimeout(speechCompletionTimerRef.current);
        speechCompletionTimerRef.current = null;
      }
      utteranceRef.current = null;
      setSpeakingState(false);
      if (wasListening) restartRecognitionAfterSpeech();
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

    const utterance = new SpeechSynthesisUtterance(speech);
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
