'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, Mic, MicOff, Send, Square, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AssistantMode = 'operations' | 'board' | 'developer';
type AssistantReply = {
  success?: boolean;
  transcript?: string;
  reply?: string;
  intent?: string;
  mode?: AssistantMode;
  risk_level?: 'read_only' | 'low' | 'medium' | 'high';
  requires_confirmation?: boolean;
  suggested_action?: string | null;
  navigation_path?: string | null;
  speak?: boolean;
  status?: string;
  error?: string;
  upstream_code?: string | null;
};

type TaraNativeBridge = {
  getAppId?: () => string;
  getPlatform?: () => string;
  isTaraVoiceAvailable?: () => boolean;
  setTaraEnabled?: (enabled: boolean) => void;
  setTaraSpeaking?: (speaking: boolean) => void;
};

type TaraTranscriptEvent = CustomEvent<{ text?: string }>;

const QUICK_PROMPTS: Record<AssistantMode, string[]> = {
  operations: ['What needs attention now?', 'Give me a full operations scan', 'How are sales and profit doing?'],
  board: ['Start a board briefing', 'What are the main risks?', 'Give me decisions and priorities'],
  developer: ['Check current CentralHub health', 'What technical issues need attention?', 'Explain the safest next fix'],
};

const WAKE_WORD = /(?:^|[\s,.:!?])(tara|thara)(?=$|[\s,.:!?])|താരാ?|தாரா?/iu;
const STOP_WORDS = /\b(?:tara\s+stop|stop\s+tara|that(?:'s| is) all|thank you tara|thanks tara|go to sleep|sleep tara)\b|താരാ?\s*(?:സ്റ്റോപ്പ്|മതി|നിർത്തു)|(?:മതി|നിർത്തു)\s*താരാ?|தாரா?\s*(?:ஸ்டாப்|போதும்)/iu;
const ASSISTANT_CUES = /(?:\?|\b(?:what|how|when|where|which|why|check|show|tell|give|find|look|open|scan|compare|calculate|order|orders|sale|sales|profit|stock|product|products|price|revenue|dashboard|store|today|yesterday|week|month|status|issue|risk|customer|competitor)\b|എന്ത|എത്ര|എങ്ങനെ|എപ്പോൾ|എവിടെ|ഏത്|നോക്ക്|പറ|കാണി|ചെക്ക്|ഓർഡർ|സെയിൽ|ലാഭം|സ്റ്റോക്ക്|പ്രോഡക്ട്|വില|റവന്യൂ|ഡാഷ്ബോർഡ്|സ്റ്റോർ|കസ്റ്റമർ|കോമ്പറ്റിറ്റർ|என்ன|எவ்வளவு|எப்படி|பார்|சொல்|ஆர்டர்|சேல்ஸ்|ஸ்டாக்|ப்ராடக்ட்|விலை)/iu;
const FOLLOW_UP_CUES = /\b(?:that|this|it|same|those|these|and then|what about|how about)\b|അത്|അതിന്റെ|ഇത്|ഇതിന്റെ|അപ്പോ|പിന്നെ|അതേ|அது|இது|அப்புறம்/iu;
const FEMALE_VOICE_HINTS = ['female', 'sonia', 'serena', 'samantha', 'karen', 'moira', 'fiona', 'victoria', 'aria', 'ava', 'veena', 'heera', 'susan', 'hazel'];

function getTaraBridge(): TaraNativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: TaraNativeBridge }).CentralHubNative;
}

function hasWakeWord(text: string) {
  return WAKE_WORD.test(text.trim());
}

function stripWakeWord(text: string) {
  return text.replace(WAKE_WORD, ' ').replace(/^[\s,.:!?-]+|[\s,.:!?-]+$/g, '').trim();
}

function looksAddressedToTara(text: string, hasConversationContext: boolean) {
  const clean = text.trim();
  if (!clean || clean.length > 220) return false;
  if (ASSISTANT_CUES.test(clean)) return true;
  return hasConversationContext && FOLLOW_UP_CUES.test(clean);
}

function pickExecutiveVoice(voices: SpeechSynthesisVoice[], language: string) {
  const prefix = language.toLowerCase().startsWith('ml') ? 'ml' : 'en-gb';
  const languageMatches = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = languageMatches.length ? languageMatches : voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  return pool.find((voice) => FEMALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint))) || pool[0] || voices[0];
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return btoa(binary);
  });
}

async function getVoiceAuthHeaders() {
  let session = (await supabase.auth.getSession()).data.session;
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error('Your CentralHub session has expired. Please sign in again.');
  return { Authorization: `Bearer ${session.access_token}` };
}

async function invokeVoice(body: Record<string, unknown>): Promise<AssistantReply> {
  const headers = await getVoiceAuthHeaders();
  const { data, error } = await supabase.functions.invoke('centralhub-voice-assistant', { body, headers });
  if (error) {
    let detail = '';
    const context = (error as any)?.context;
    try {
      if (context?.clone) {
        const payload = await context.clone().json();
        detail = [payload?.error, payload?.upstream_code, payload?.status ? `HTTP ${payload.status}` : ''].filter(Boolean).join(' · ');
      }
    } catch {
      // Keep the original Functions error when the response body is not JSON.
    }
    throw new Error(detail || error.message || 'Tara request failed.');
  }
  return (data || {}) as AssistantReply;
}

export default function CentralHubVoiceAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>('operations');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<AssistantReply | null>(null);
  const [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [taraSession, setTaraSession] = useState(false);
  const [nativeWakeAvailable, setNativeWakeAvailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const recordingRef = useRef(false);
  const taraSessionRef = useRef(false);
  const responseRef = useRef<AssistantReply | null>(null);

  const isDashboard = pathname === '/dashboard';
  const fabPosition = isDashboard
    ? 'right-[5rem] sm:right-[5.5rem] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6'
    : 'right-4 sm:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6';

  const setSession = useCallback((active: boolean) => {
    taraSessionRef.current = active;
    setTaraSession(active);
  }, []);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    responseRef.current = response;
  }, [response]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  };

  useEffect(() => () => {
    stopTracks();
    window.speechSynthesis?.cancel();
    getTaraBridge()?.setTaraSpeaking?.(false);
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window) || !autoSpeak) {
      getTaraBridge()?.setTaraSpeaking?.(false);
      onDone?.();
      return;
    }

    const bridge = getTaraBridge();
    bridge?.setTaraSpeaking?.(true);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    utterance.lang = hasMalayalam ? 'ml-IN' : 'en-GB';
    utterance.rate = 0.93;
    utterance.pitch = 1.04;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = pickExecutiveVoice(voices, utterance.lang);
    if (preferred) utterance.voice = preferred;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      bridge?.setTaraSpeaking?.(false);
      onDone?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }, [autoSpeak]);

  const runCommand = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setOpen(true);
    setError('');
    setTranscript(clean);
    setResponse(null);
    try {
      const result = await invokeVoice({ action: 'command', text: clean, mode });
      if (!result.success || !result.reply) throw new Error(result.error || 'Tara could not answer.');
      setResponse(result);
      responseRef.current = result;
      if (result.speak !== false) speak(result.reply);
      else getTaraBridge()?.setTaraSpeaking?.(false);
    } catch (e: any) {
      setError(e?.message || 'Tara failed.');
      getTaraBridge()?.setTaraSpeaking?.(false);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [mode, speak]);

  const handleNativeTranscript = useCallback((rawText: string) => {
    if (processingRef.current || recordingRef.current) return;
    const heard = String(rawText || '').trim();
    if (!heard) return;

    const woke = hasWakeWord(heard);
    if (STOP_WORDS.test(heard) && (taraSessionRef.current || woke)) {
      setSession(false);
      setOpen(false);
      setTranscript('');
      setResponse(null);
      speak('Of course. I’ll stay quiet until you call Tara again.');
      return;
    }

    if (!taraSessionRef.current) {
      if (!woke) return;
      setSession(true);
      setOpen(true);
      const command = stripWakeWord(heard);
      if (!command) {
        setTranscript('Tara');
        setResponse(null);
        speak('Yes?');
        return;
      }
      void runCommand(command);
      return;
    }

    const command = woke ? stripWakeWord(heard) : heard;
    if (!command) return;
    const hasContext = Boolean(responseRef.current?.reply);
    if (woke || looksAddressedToTara(command, hasContext)) {
      void runCommand(command);
    }
  }, [runCommand, setSession, speak]);

  useEffect(() => {
    const bridge = getTaraBridge();
    let available = false;
    try {
      available = bridge?.getPlatform?.() === 'android' && bridge?.isTaraVoiceAvailable?.() === true;
    } catch {
      available = false;
    }
    setNativeWakeAvailable(available);
    if (available) bridge?.setTaraEnabled?.(true);

    const onTranscript = (event: Event) => {
      const text = String((event as TaraTranscriptEvent).detail?.text || '').trim();
      if (text) handleNativeTranscript(text);
    };
    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener);

    return () => {
      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener);
      bridge?.setTaraEnabled?.(false);
    };
  }, [handleNativeTranscript]);

  const transcribeAndRun = async (blob: Blob) => {
    setProcessing(true);
    processingRef.current = true;
    setError('');
    try {
      const audioBase64 = await blobToBase64(blob);
      const data = await invokeVoice({ action: 'transcribe', audioBase64, mimeType: blob.type || 'audio/webm' });
      const text = String(data?.transcript || '').trim();
      if (!data?.success || !text) throw new Error(data?.error || 'I could not hear that clearly.');
      setInput('');
      setSession(true);
      processingRef.current = false;
      setProcessing(false);
      await runCommand(text);
    } catch (e: any) {
      processingRef.current = false;
      setProcessing(false);
      getTaraBridge()?.setTaraSpeaking?.(false);
      setError(e?.message || 'Voice transcription failed.');
    }
  };

  const startRecording = async () => {
    if (processingRef.current || recordingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported on this device. You can still type a command.');
      setOpen(true);
      return;
    }
    setOpen(true);
    setSession(true);
    setError('');
    setResponse(null);
    getTaraBridge()?.setTaraSpeaking?.(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecording(false);
        recordingRef.current = false;
        stopTracks();
        if (blob.size > 100) void transcribeAndRun(blob);
        else {
          getTaraBridge()?.setTaraSpeaking?.(false);
          setError('No voice was captured. Try again.');
        }
      };
      recorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      stopTimerRef.current = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 45_000);
    } catch (e: any) {
      stopTracks();
      recordingRef.current = false;
      setRecording(false);
      getTaraBridge()?.setTaraSpeaking?.(false);
      setError(e?.name === 'NotAllowedError' ? 'Microphone permission was not granted.' : (e?.message || 'Could not start the microphone.'));
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const close = () => {
    if (recording) stopRecording();
    window.speechSynthesis?.cancel();
    getTaraBridge()?.setTaraSpeaking?.(false);
    setOpen(false);
  };

  const statusText = useMemo(() => {
    if (recording) return 'Listening… tap stop when finished';
    if (processing) return 'Tara is working…';
    if (nativeWakeAvailable && taraSession) return 'Conversation mode is active. Tara will answer command-like follow-ups and ignore casual background talk.';
    if (nativeWakeAvailable) return 'Say “Tara” to wake your executive assistant. No button is required.';
    return 'Tap the mic and speak naturally in Malayalam, English, or both.';
  }, [nativeWakeAvailable, processing, recording, taraSession]);

  return (
    <>
      {open && (
        <section className="fixed z-[85] right-3 left-3 bottom-[calc(10rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-24 sm:w-[min(92vw,460px)] rounded-3xl border border-cyan-500/25 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden" aria-label="Tara Executive Assistant">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center"><Bot size={19} /></div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white">Tara</p>
                <p className="text-[10px] text-slate-400 truncate">CentralHub executive assistant · private · read-first safety</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={`hidden sm:inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${taraSession ? 'border-emerald-500/30 text-emerald-200' : 'border-slate-700 text-slate-500'}`}>{taraSession ? 'conversation active' : 'waiting for Tara'}</span>
              <button type="button" onClick={() => { setAutoSpeak((v) => !v); window.speechSynthesis?.cancel(); getTaraBridge()?.setTaraSpeaking?.(false); }} className="h-9 w-9 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 flex items-center justify-center" aria-label={autoSpeak ? 'Mute Tara voice replies' : 'Enable Tara voice replies'}>{autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <button type="button" onClick={close} className="h-9 w-9 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 flex items-center justify-center" aria-label="Hide Tara"><X size={17} /></button>
            </div>
          </div>

          <div className="px-4 pt-3 flex gap-2">
            {(['operations','board','developer'] as AssistantMode[]).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} className={`flex-1 rounded-xl border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === item ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-slate-800 bg-slate-900/70 text-slate-500'}`}>{item}</button>
            ))}
          </div>

          <div className="p-4 space-y-3 max-h-[58vh] overflow-y-auto overscroll-contain">
            <div className={`rounded-2xl border p-3 ${recording ? 'border-rose-400/40 bg-rose-500/10' : taraSession ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="flex items-center gap-3">
                <button type="button" disabled={processing} onClick={recording ? stopRecording : startRecording} className={`h-12 w-12 shrink-0 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-50 ${recording ? 'border-rose-300 bg-rose-500 text-white animate-pulse' : 'border-cyan-300/40 bg-cyan-500 text-slate-950'}`} aria-label={recording ? 'Stop recording' : 'Talk to Tara manually'}>{recording ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}</button>
                <div className="min-w-0"><p className="text-xs font-bold text-slate-100">{statusText}</p><p className="mt-1 text-[10px] text-slate-500">Say “Tara stop” or “that’s all” to end the conversation. Wake listening only runs while CentralHub is in the foreground.</p></div>
              </div>
            </div>

            {!transcript && !response && !processing && (
              <div className="flex flex-wrap gap-2">{QUICK_PROMPTS[mode].map((prompt) => <button key={prompt} type="button" onClick={() => { setSession(true); void runCommand(prompt); }} className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:border-cyan-500/40">{prompt}</button>)}</div>
            )}

            {transcript && <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">You said</p><p className="mt-1 text-xs text-slate-200">{transcript}</p></div>}
            {processing && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200">Tara is analysing live CentralHub data…</div>}
            {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}

            {response?.reply && (
              <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/8 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Tara</p><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${response.requires_confirmation ? 'border-amber-400/40 text-amber-200' : 'border-emerald-500/30 text-emerald-200'}`}>{response.requires_confirmation ? 'confirmation required' : response.risk_level || 'read only'}</span></div>
                <p className="mt-2 text-sm leading-relaxed text-slate-100">{response.reply}</p>
                {response.requires_confirmation && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-[10px] text-amber-100">No write action was executed. Tara deliberately gates deploys, code/database changes, pricing, refunds, messages and other external actions.</div>}
                {response.navigation_path && <button type="button" onClick={() => { router.push(response.navigation_path!); setOpen(false); }} className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-cyan-200">Open related page</button>}
              </div>
            )}

            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = input.trim(); if (!value) return; setInput(''); setSession(true); void runCommand(value); }}>
              <input value={input} onChange={(event) => setInput(event.target.value)} disabled={processing || recording} placeholder="Or type a command to Tara…" className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-500/40" />
              <button type="submit" disabled={!input.trim() || processing || recording} className="h-10 w-10 rounded-xl border border-cyan-400/30 bg-cyan-500 text-slate-950 flex items-center justify-center disabled:opacity-40" aria-label="Send command to Tara"><Send size={16} /></button>
            </form>
          </div>
        </section>
      )}

      <button type="button" onClick={() => { if (open) close(); else if (nativeWakeAvailable) setOpen(true); else void startRecording(); }} className={`fixed z-[80] ${fabPosition} h-14 w-14 rounded-full border-2 flex items-center justify-center shadow-2xl transition-all active:scale-95 touch-manipulation ${recording ? 'border-rose-200 bg-rose-500 text-white shadow-rose-950/40 animate-pulse' : taraSession ? 'border-emerald-200/40 bg-emerald-500 text-slate-950 shadow-emerald-950/40' : open ? 'border-cyan-200/40 bg-slate-800 text-cyan-200' : 'border-white/15 bg-cyan-500 text-slate-950 shadow-cyan-950/40'}`} aria-label={open ? 'Hide Tara' : nativeWakeAvailable ? 'Open Tara' : 'Talk to Tara'}>{recording ? <MicOff size={22} /> : <Mic size={22} />}</button>
    </>
  );
}
