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
  const onCommandRef = useRef(onCommand);
  const isListeningRef = useRef(false);
  const restartTimeoutRef = useRef<any>(null);

  // Update ref when onCommand changes
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

  const initRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('not-supported');
      return;
    }

    // Clean up previous instance if any
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

      // Auto-clear visual feedback
      setTimeout(() => {
        setLastCommand(current => current === transcript ? null : current);
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error);

      // Don't show error for transient silence
      if (event.error === 'no-speech') return;

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Check microphone permissions',
        'network': 'Network error during recognition',
        'aborted': 'Voice recognition stopped',
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

      // If we are still supposed to be listening, restart
      if (isListeningRef.current) {
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isListeningRef.current && !synthRef.current?.speaking) {
            console.log('[Voice] Restarting...');
            try {
               recognitionRef.current?.start();
            } catch (e) {
               console.warn('[Voice] Restart failed', e);
               // If it fails to start, it might be already starting or in a weird state
               // We'll let the next trigger handle it
            }
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;

    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch(e) {}
      }
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    };
  }, []);

  const startListening = useCallback(() => {
    console.log('[Voice] startListening called');
    setError(null);
    isListeningRef.current = true;

    // Always create a fresh instance when starting to ensure maximum accuracy
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
    if (synthRef.current) {
      console.log('[Voice] Speaking:', text);

      // Stop listening while speaking to prevent self-triggering
      const wasListening = isListeningRef.current;
      if (wasListening && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-GB';

      const femaleVoice = voices.find(v =>
        (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google UK English Female')) &&
        (v.lang.startsWith('en'))
      ) || voices.find(v => v.lang.startsWith('en-GB')) || voices[0];

      if (femaleVoice) utterance.voice = femaleVoice;
      utterance.rate = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        // Restart listening after a small delay to ensure silence
        if (wasListening) {
          setTimeout(() => {
            if (isListeningRef.current) {
              console.log('[Voice] Resuming listening after speech');
              try {
                recognitionRef.current?.start();
              } catch (e) {
                console.warn('[Voice] Resume failed:', e);
              }
            }
          }, 500);
        }
      };

      synthRef.current.speak(utterance);
    }
  }, [voices]);

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
