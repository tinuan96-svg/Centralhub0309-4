'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Menu, Mic, MicOff, Send, Settings, Square, Volume2, VolumeX, X } from 'lucide-react';
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

type NativeBridge = {
  getAppId?: () => string;
  getPlatform?: () => string;
  isTaraVoiceAvailable?: () => boolean;
  setTaraEnabled?: (enabled: boolean) => void;
  setTaraSpeaking?: (speaking: boolean) => void;
  isTaraTtsReady?: () => boolean;
  speakTara?: (text: string, languageTag: string) => boolean;
  stopTaraTts?: () => void;
};

type NativeTranscriptEvent = CustomEvent<{ text?: string }>;
type VoiceState = 'waiting' | 'listening' | 'processing' | 'speaking';
type NoraThemeId =
  | 'signature'
  | 'waveform'
  | 'holographic'
  | 'minimal'
  | 'executive'
  | 'galaxy'
  | 'ripple'
  | 'aurora'
  | 'glass'
  | 'earth';

type NoraTheme = {
  id: NoraThemeId;
  name: string;
  subtitle: string;
  accent: string;
  secondary: string;
  background: string;
  orb: NoraThemeId;
};

const THEMES: NoraTheme[] = [
  { id: 'signature', name: 'Signature Orb', subtitle: 'Clean · Elegant · Professional', accent: '#55b8ff', secondary: '#b9dcff', background: 'radial-gradient(circle at 50% 32%, rgba(26,111,255,.18), transparent 35%), #02050a', orb: 'signature' },
  { id: 'waveform', name: 'Waveform Flow', subtitle: 'Modern · Dynamic · Minimal', accent: '#58aaff', secondary: '#9d6cff', background: 'radial-gradient(circle at 50% 22%, rgba(87,67,255,.14), transparent 34%), #02050a', orb: 'waveform' },
  { id: 'holographic', name: 'Holographic Core', subtitle: 'High-Tech · Intelligent · Futuristic', accent: '#5ac8ff', secondary: '#315dff', background: 'radial-gradient(circle at 50% 32%, rgba(18,121,255,.18), transparent 38%), #01040a', orb: 'holographic' },
  { id: 'minimal', name: 'Minimal Circle', subtitle: 'Simple · Calm · Beautiful', accent: '#b3dcff', secondary: '#5a9cff', background: 'linear-gradient(180deg, #010204, #03070d 70%, #010204)', orb: 'minimal' },
  { id: 'executive', name: 'Executive Mode', subtitle: 'Stylish · Professional · Powerful', accent: '#67c7ff', secondary: '#345dff', background: 'radial-gradient(circle at 75% 24%, rgba(23,102,255,.20), transparent 30%), #02050b', orb: 'executive' },
  { id: 'galaxy', name: 'Particle Galaxy', subtitle: 'Creative · Premium · Immersive', accent: '#48a8ff', secondary: '#93d4ff', background: 'radial-gradient(circle at 50% 34%, rgba(20,117,255,.16), transparent 34%), #01030a', orb: 'galaxy' },
  { id: 'ripple', name: 'Voice Ripple', subtitle: 'Bold · Interactive · Intuitive', accent: '#6ec7ff', secondary: '#4578ff', background: 'radial-gradient(circle at 50% 42%, rgba(32,111,255,.14), transparent 30%), #02050a', orb: 'ripple' },
  { id: 'aurora', name: 'Aurora Blend', subtitle: 'Vibrant · Modern · Premium', accent: '#57c7ff', secondary: '#945cff', background: 'radial-gradient(circle at 58% 28%, rgba(103,72,255,.19), transparent 33%), #02040a', orb: 'aurora' },
  { id: 'glass', name: 'Glass UI', subtitle: 'Refined · Elegant · Productive', accent: '#70cfff', secondary: '#8fe6ff', background: 'linear-gradient(160deg, #030813, #010205 65%)', orb: 'glass' },
  { id: 'earth', name: 'Earth View', subtitle: 'Inspiring · Bold · Next Level', accent: '#57aaff', secondary: '#b2e4ff', background: 'radial-gradient(circle at 50% 72%, rgba(22,91,190,.22), transparent 30%), #01040a', orb: 'earth' },
];

const WAKE_WORD = /(?:^|[\s,.:!?])(shruthi|sruthi|shruti|nora|norah|noora|noura|norra)(?=$|[\s,.:!?])|ശ്രുതി|ஸ்ருதி|നോറാ?|நோரா?/iu;
const STOP_WORDS = /\b(?:(?:shruthi|sruthi|shruti|nora|norah|noora)\s+stop|stop\s+(?:shruthi|sruthi|shruti|nora|norah|noora)|that(?:'s| is) all|thank you shruthi|thanks shruthi|thank you nora|thanks nora|go to sleep|sleep shruthi|sleep nora)\b|ശ്രുതി\s*(?:സ്റ്റോപ്പ്|മതി|നിർത്തു)|നോറാ?\s*(?:സ്റ്റോപ്പ്|മതി|നിർത്തു)|(?:മതി|നിർത്തു)\s*(?:ശ്രുതി|നോറാ?)|ஸ்ருதி\s*(?:ஸ்டாப்|போதும்)|நோரா?\s*(?:ஸ்டாப்|போதும்)/iu;
const ASSISTANT_CUES = /(?:\?|\b(?:what|how|when|where|which|why|check|show|tell|give|find|look|open|scan|compare|calculate|order|orders|sale|sales|profit|stock|product|products|price|revenue|dashboard|store|today|yesterday|week|month|status|issue|risk|customer|competitor|finance|security|payment|marketing)\b|എന്ത|എത്ര|എങ്ങനെ|എപ്പോൾ|എവിടെ|ഏത്|നോക്ക്|പറ|കാണി|ചെക്ക്|ഓർഡർ|സെയിൽ|ലാഭം|സ്റ്റോക്ക്|പ്രോഡക്ട്|വില|റവന്യൂ|ഡാഷ്ബോർഡ്|സ്റ്റോർ|കസ്റ്റമർ|കോമ്പറ്റിറ്റർ|என்ன|எவ்வளவு|எப்படி|பார்|சொல்|ஆர்டர்|சேல்ஸ்|ஸ்டாக்|ப்ராடக்ட்|விலை)/iu;
const FOLLOW_UP_CUES = /\b(?:that|this|it|same|those|these|and then|what about|how about|also|next)\b|അത്|അതിന്റെ|ഇത്|ഇതിന്റെ|അപ്പോ|പിന്നെ|അതേ|കൂടാതെ|அது|இது|அப்புறம்/iu;
const FEMALE_VOICE_HINTS = ['female', 'sonia', 'serena', 'samantha', 'karen', 'moira', 'fiona', 'victoria', 'aria', 'ava', 'veena', 'heera', 'susan', 'hazel'];

function getNativeBridge(): NativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBridge }).CentralHubNative;
}

function hasWakeWord(text: string) {
  return WAKE_WORD.test(text.trim());
}

function stripWakeWord(text: string) {
  return text.replace(WAKE_WORD, ' ').replace(/^[\s,.:!?-]+|[\s,.:!?-]+$/g, '').trim();
}

function looksAddressedToNora(text: string, hasConversationContext: boolean) {
  const clean = text.trim();
  if (!clean || clean.length > 260) return false;
  if (ASSISTANT_CUES.test(clean)) return true;
  return hasConversationContext && FOLLOW_UP_CUES.test(clean);
}

function pickExecutiveVoice(voices: SpeechSynthesisVoice[], language: string) {
  const prefix = language.toLowerCase().startsWith('ml') ? 'ml' : 'en-gb';
  const languageMatches = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = languageMatches.length ? languageMatches : voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  return pool.find((voice) => FEMALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint))) || voices.find((voice) => FEMALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint)));
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
    throw new Error(detail || error.message || 'Shruthi request failed.');
  }
  return (data || {}) as AssistantReply;
}

function inferMode(pathname: string, text: string): AssistantMode {
  const value = `${pathname} ${text}`.toLowerCase();
  if (/developer|github|supabase|netlify|deploy|code|schema|api|webhook|integration/.test(value)) return 'developer';
  if (/board|strategy|executive|finance|financial|profit|revenue|forecast|planning|risk/.test(value)) return 'board';
  return 'operations';
}

function themePoolForContext(pathname: string, text = ''): NoraThemeId[] {
  const value = `${pathname} ${text}`.toLowerCase();
  if (/finance|bank|payment|security|legal|risk/.test(value)) return ['executive', 'minimal', 'glass', 'holographic'];
  if (/marketing|campaign|creative|whatsapp/.test(value)) return ['aurora', 'waveform', 'galaxy', 'signature'];
  if (/analytics|business-intelligence|report|strategy|executive/.test(value)) return ['earth', 'holographic', 'signature', 'glass'];
  if (/product|stock|purchase|procurement|order|fulfil/.test(value)) return ['signature', 'ripple', 'glass', 'holographic'];
  return THEMES.map((theme) => theme.id);
}

function quickPrompts(pathname: string) {
  const value = pathname.toLowerCase();
  if (/finance|bank/.test(value)) return ['Summarize finance today', 'Check reconciliation', 'Show cash risks', 'Explain unusual movements'];
  if (/product|stock|purchase/.test(value)) return ['Check stock risks', 'What needs ordering?', 'Show product trends', 'Review procurement'];
  if (/marketing/.test(value)) return ['Summarize marketing', 'Check campaign health', 'Show growth signals', 'Draft next steps'];
  if (/security/.test(value)) return ['Check security now', 'Explain active risks', 'Show affected stores', 'Recommend safe action'];
  return ['Summarize today', 'What needs attention?', 'Show sales insights', 'Plan next steps'];
}

function Orb({ theme, state }: { theme: NoraTheme; state: VoiceState }) {
  return (
    <div className={`nora-orb-shell nora-${theme.orb} nora-${state}`} aria-hidden="true">
      <div className="nora-orb-ring nora-ring-a" />
      <div className="nora-orb-ring nora-ring-b" />
      <div className="nora-orb-core">
        <div className="nora-orb-flow nora-flow-a" />
        <div className="nora-orb-flow nora-flow-b" />
        <div className="nora-orb-stars" />
      </div>
    </div>
  );
}

export default function CentralHubVoiceAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<AssistantReply | null>(null);
  const [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [noraSession, setNoraSession] = useState(false);
  const [nativeWakeAvailable, setNativeWakeAvailable] = useState(false);
  const [themeId, setThemeId] = useState<NoraThemeId>('signature');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const speechVisualTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const recordingRef = useRef(false);
  const noraSessionRef = useRef(false);
  const responseRef = useRef<AssistantReply | null>(null);
  const themeRef = useRef<NoraThemeId>('signature');

  const theme = useMemo(() => THEMES.find((item) => item.id === themeId) || THEMES[0], [themeId]);
  const prompts = useMemo(() => quickPrompts(pathname), [pathname]);

  const chooseTheme = useCallback((text = '') => {
    const pool = themePoolForContext(pathname, text);
    const candidates = pool.filter((id) => id !== themeRef.current);
    const list = candidates.length ? candidates : pool;
    const next = list[Math.floor(Math.random() * list.length)] || 'signature';
    themeRef.current = next;
    setThemeId(next);
  }, [pathname]);

  const setSession = useCallback((active: boolean) => {
    noraSessionRef.current = active;
    setNoraSession(active);
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

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  }, []);

  const stopSpeech = useCallback(() => {
    if (speechVisualTimerRef.current) window.clearTimeout(speechVisualTimerRef.current);
    speechVisualTimerRef.current = null;
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    const bridge = getNativeBridge();
    bridge?.stopTaraTts?.();
    bridge?.setTaraSpeaking?.(false);
  }, []);

  useEffect(() => () => {
    stopTracks();
    stopSpeech();
  }, [stopSpeech, stopTracks]);

  const speak = useCallback((text: string) => {
    if (!text || typeof window === 'undefined' || !autoSpeak) {
      stopSpeech();
      return;
    }

    const bridge = getNativeBridge();
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    const language = hasMalayalam ? 'ml-IN' : 'en-GB';
    setSpeaking(true);

    if (speechVisualTimerRef.current) window.clearTimeout(speechVisualTimerRef.current);
    const estimatedMs = Math.min(22_000, Math.max(1800, text.length * 58));
    speechVisualTimerRef.current = window.setTimeout(() => setSpeaking(false), estimatedMs);

    if (bridge?.getPlatform?.() === 'android' && bridge?.speakTara) {
      window.speechSynthesis?.cancel();
      try {
        if (bridge.speakTara(text, language)) return;
      } catch {
        // Fall through to Web Speech when native TTS is not ready.
      }
    }

    if (!('speechSynthesis' in window)) {
      bridge?.setTaraSpeaking?.(false);
      setSpeaking(false);
      return;
    }

    bridge?.setTaraSpeaking?.(true);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 0.93;
    utterance.pitch = 1.04;
    utterance.volume = 1;
    const preferred = pickExecutiveVoice(window.speechSynthesis.getVoices(), language);
    if (!preferred) {
      bridge?.setTaraSpeaking?.(false);
      if (speechVisualTimerRef.current) window.clearTimeout(speechVisualTimerRef.current);
      speechVisualTimerRef.current = null;
      setSpeaking(false);
      return;
    }
    utterance.voice = preferred;

    const finish = () => {
      bridge?.setTaraSpeaking?.(false);
      if (speechVisualTimerRef.current) window.clearTimeout(speechVisualTimerRef.current);
      speechVisualTimerRef.current = null;
      setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }, [autoSpeak, stopSpeech]);

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
      const mode = inferMode(pathname, clean);
      const result = await invokeVoice({
        action: 'command',
        text: clean,
        mode,
        page_context: pathname,
        assistant_name: 'SHRUTHI',
        adaptive_behavior: true,
      });
      if (!result.success || !result.reply) throw new Error(result.error || 'Shruthi could not answer.');
      setResponse(result);
      responseRef.current = result;
      if (result.speak !== false) speak(result.reply);
      else stopSpeech();
    } catch (e: any) {
      setError(e?.message || 'Shruthi failed.');
      stopSpeech();
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [pathname, speak, stopSpeech]);

  const handleNativeTranscript = useCallback((rawText: string) => {
    if (processingRef.current || recordingRef.current) return;
    const heard = String(rawText || '').trim();
    if (!heard) return;

    const woke = hasWakeWord(heard);
    if (STOP_WORDS.test(heard) && (noraSessionRef.current || woke)) {
      setSession(false);
      setOpen(false);
      setTranscript('');
      setResponse(null);
      speak('Of course. I’ll stay quiet until you call me again.');
      return;
    }

    if (!noraSessionRef.current) {
      if (!woke) return;
      chooseTheme(heard);
      setSession(true);
      setOpen(true);
      const command = stripWakeWord(heard);
      if (!command) {
        setTranscript('SHRUTHI');
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
    if (woke || looksAddressedToNora(command, hasContext)) void runCommand(command);
  }, [chooseTheme, runCommand, setSession, speak]);

  useEffect(() => {
    const bridge = getNativeBridge();
    let available = false;
    try {
      available = bridge?.getPlatform?.() === 'android' && bridge?.isTaraVoiceAvailable?.() === true;
    } catch {
      available = false;
    }
    setNativeWakeAvailable(available);
    if (available) bridge?.setTaraEnabled?.(true);

    const onTranscript = (event: Event) => {
      const text = String((event as NativeTranscriptEvent).detail?.text || '').trim();
      if (text) handleNativeTranscript(text);
    };
    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener);
    return () => {
      window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener);
      bridge?.setTaraEnabled?.(false);
    };
  }, [handleNativeTranscript]);

  const transcribeAndRun = useCallback(async (blob: Blob) => {
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
      stopSpeech();
      setError(e?.message || 'Voice transcription failed.');
    }
  }, [runCommand, setSession, stopSpeech]);

  const startRecording = useCallback(async () => {
    if (processingRef.current || recordingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported on this device. You can still type a command.');
      chooseTheme();
      setOpen(true);
      return;
    }

    chooseTheme();
    setOpen(true);
    setSession(true);
    setError('');
    setResponse(null);
    getNativeBridge()?.setTaraSpeaking?.(true);

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
        getNativeBridge()?.setTaraSpeaking?.(false);
        if (blob.size > 100) void transcribeAndRun(blob);
        else setError('No voice was captured. Try again.');
      };
      recorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      stopTimerRef.current = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 45_000);
    } catch (e: any) {
      stopTracks();
      recordingRef.current = false;
      setRecording(false);
      getNativeBridge()?.setTaraSpeaking?.(false);
      setError(e?.name === 'NotAllowedError' ? 'Microphone permission was not granted.' : (e?.message || 'Could not start the microphone.'));
    }
  }, [chooseTheme, setSession, stopTracks, transcribeAndRun]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const endConversation = useCallback(() => {
    if (recordingRef.current) stopRecording();
    stopTracks();
    stopSpeech();
    setSession(false);
    setOpen(false);
    setTranscript('');
    setResponse(null);
    setError('');
  }, [setSession, stopRecording, stopSpeech, stopTracks]);

  const openNora = useCallback(() => {
    chooseTheme();
    setOpen(true);
  }, [chooseTheme]);

  const voiceState: VoiceState = processing ? 'processing' : speaking ? 'speaking' : recording ? 'listening' : (noraSession ? 'listening' : 'waiting');
  const statusLabel =
    voiceState === 'processing' ? 'Processing…' :
    voiceState === 'speaking' ? 'Speaking…' :
    voiceState === 'listening' ? 'Listening…' :
    nativeWakeAvailable ? 'Say “SHRUTHI”' : 'Ready';

  const rootStyle = {
    '--nora-accent': theme.accent,
    '--nora-secondary': theme.secondary,
    background: theme.background,
  } as CSSProperties;

  return (
    <>
      {open && (
        <section className="nora-screen fixed inset-0 z-[120] overflow-hidden text-white" style={rootStyle} aria-label="SHRUTHI AI Executive Assistant">
          <div className="absolute inset-0 nora-ambient pointer-events-none" />
          <div className="relative z-10 flex h-full min-h-0 flex-col px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))] sm:px-7">
            <header className="flex items-center justify-between gap-3">
              <button type="button" onClick={endConversation} className="nora-icon-button" aria-label="Return to CentralHub">
                <Menu size={21} />
              </button>
              <div className="text-center">
                <div className="text-[22px] font-light tracking-tight sm:text-[26px]">Central<span className="font-semibold text-[var(--nora-accent)]">Hub</span></div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.42em] text-slate-500">Business · Insights · Action</div>
              </div>
              <button type="button" onClick={() => chooseTheme()} className="nora-icon-button" aria-label="Change SHRUTHI appearance">
                <Settings size={20} />
              </button>
            </header>

            <main className="flex min-h-0 flex-1 flex-col items-center justify-center py-3 sm:py-6">
              <div className="flex w-full max-w-5xl min-h-0 flex-1 flex-col items-center justify-center">
                <Orb theme={theme} state={voiceState} />

                <div className="mt-4 text-center sm:mt-6">
                  <h2 className="text-4xl font-light tracking-tight sm:text-5xl">SHRUTHI</h2>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.42em] text-slate-400">Your AI Executive Assistant</p>
                  <div className="mx-auto mt-4 flex h-8 items-center justify-center gap-[3px]">
                    {Array.from({ length: 17 }).map((_, index) => (
                      <span
                        key={index}
                        className={`nora-wavebar ${voiceState === 'listening' || voiceState === 'speaking' ? 'nora-wavebar-live' : ''}`}
                        style={{ animationDelay: `${index * 45}ms` }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-sm font-medium tracking-[0.18em] text-[var(--nora-accent)]">{statusLabel}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{theme.name} · {theme.subtitle}</p>
                </div>

                {(transcript || processing || response?.reply || error) && (
                  <div className="mt-5 w-full max-w-2xl space-y-2">
                    {transcript && <div className="nora-glass-card"><span className="nora-card-label">You</span><p>{transcript}</p></div>}
                    {processing && <div className="nora-glass-card nora-processing-card">SHRUTHI is analysing live CentralHub data…</div>}
                    {error && <div className="nora-glass-card border-rose-400/30 text-rose-100">{error}</div>}
                    {response?.reply && (
                      <div className="nora-glass-card">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="nora-card-label text-[var(--nora-accent)]">SHRUTHI</span>
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] uppercase tracking-wider text-slate-400">
                            {response.requires_confirmation ? 'Approval required' : response.risk_level || 'read only'}
                          </span>
                        </div>
                        <p className="leading-relaxed">{response.reply}</p>
                        {response.navigation_path && (
                          <button
                            type="button"
                            onClick={() => { setSession(false); router.push(response.navigation_path!); setOpen(false); }}
                            className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--nora-accent)]"
                          >
                            Open related page <ChevronRight size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!processing && !response?.reply && !error && (
                  <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => { setSession(true); void runCommand(prompt); }}
                        className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] text-slate-300 backdrop-blur-md transition hover:border-[var(--nora-accent)]/50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </main>

            <footer className="mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3">
              <form
                className="nora-input flex min-w-0 flex-1 items-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = input.trim();
                  if (!value) return;
                  setInput('');
                  setSession(true);
                  void runCommand(value);
                }}
              >
                <span className="pl-4 text-lg text-[var(--nora-accent)]">✦</span>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={processing || recording}
                  placeholder="Ask SHRUTHI"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button type="submit" disabled={!input.trim() || processing || recording} className="mr-2 rounded-full p-2 text-slate-300 disabled:opacity-30" aria-label="Send to SHRUTHI">
                  <Send size={18} />
                </button>
              </form>

              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={processing}
                className={`nora-action-button ${recording ? 'nora-mic-active' : ''}`}
                aria-label={recording ? 'Stop listening' : 'Talk to SHRUTHI'}
              >
                {recording ? <Square size={19} fill="currentColor" /> : <Mic size={21} />}
                <span className="hidden sm:block">{recording ? 'Stop' : 'Talk'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setAutoSpeak((value) => !value); if (autoSpeak) stopSpeech(); }}
                className="nora-action-button"
                aria-label={autoSpeak ? 'Mute SHRUTHI' : 'Enable SHRUTHI voice'}
              >
                {autoSpeak ? <Volume2 size={20} /> : <VolumeX size={20} />}
                <span className="hidden sm:block">{autoSpeak ? 'Mute' : 'Voice'}</span>
              </button>

              <button type="button" onClick={endConversation} className="nora-action-button nora-end-button" aria-label="End SHRUTHI conversation">
                <X size={22} />
                <span className="hidden sm:block">End</span>
              </button>
            </footer>
          </div>
        </section>
      )}

      {!open && (
        <button
          type="button"
          onClick={nativeWakeAvailable ? openNora : startRecording}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-500 text-slate-950 shadow-2xl shadow-cyan-950/50 active:scale-95 sm:bottom-6 sm:right-6"
          aria-label={nativeWakeAvailable ? 'Open SHRUTHI' : 'Talk to SHRUTHI'}
        >
          {recording ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      )}

      <style jsx global>{`
        .nora-screen { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .nora-ambient {
          background:
            radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--nora-accent) 10%, transparent), transparent 36%),
            linear-gradient(115deg, transparent 15%, rgba(255,255,255,.018) 45%, transparent 70%);
          opacity: .95;
        }
        .nora-icon-button {
          width: 44px; height: 44px; border-radius: 9999px; display:flex; align-items:center; justify-content:center;
          border: 1px solid color-mix(in srgb, var(--nora-accent) 35%, rgba(255,255,255,.12));
          background: rgba(10,16,28,.66); color:#e6f4ff; box-shadow: inset 0 0 16px rgba(255,255,255,.025);
        }
        .nora-orb-shell {
          position: relative; width: min(44vw, 310px); aspect-ratio: 1; display:grid; place-items:center;
          transition: transform .5s ease, filter .5s ease;
        }
        .nora-orb-core {
          position:absolute; inset:12%; border-radius:9999px; overflow:hidden;
          border:1px solid color-mix(in srgb, var(--nora-accent) 82%, white 18%);
          background:
            radial-gradient(circle at 40% 36%, rgba(255,255,255,.28), transparent 20%),
            radial-gradient(circle at 60% 58%, color-mix(in srgb, var(--nora-secondary) 40%, transparent), transparent 38%),
            radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--nora-accent) 36%, #031024), #020610 68%);
          box-shadow:
            0 0 22px color-mix(in srgb, var(--nora-accent) 55%, transparent),
            0 0 70px color-mix(in srgb, var(--nora-accent) 24%, transparent),
            inset 0 0 42px rgba(255,255,255,.12);
        }
        .nora-orb-ring { position:absolute; border-radius:9999px; border:1px solid color-mix(in srgb, var(--nora-accent) 48%, transparent); }
        .nora-ring-a { inset:4%; animation:nora-spin 16s linear infinite; }
        .nora-ring-b { inset:0; border-style:dotted; opacity:.35; animation:nora-spin-reverse 25s linear infinite; }
        .nora-orb-flow { position:absolute; width:130%; height:42%; left:-15%; top:30%; border-radius:50%; filter:blur(5px); opacity:.8; transform:rotate(-12deg); }
        .nora-flow-a { background:linear-gradient(90deg, transparent, var(--nora-accent), white, transparent); animation:nora-flow 4.5s ease-in-out infinite alternate; }
        .nora-flow-b { top:46%; background:linear-gradient(90deg, transparent, var(--nora-secondary), transparent); transform:rotate(18deg); animation:nora-flow 5.6s ease-in-out infinite alternate-reverse; }
        .nora-orb-stars { position:absolute; inset:0; opacity:.55; background-image:radial-gradient(circle, rgba(255,255,255,.9) 0 1px, transparent 1.2px); background-size:17px 19px; mask-image:radial-gradient(circle, black, transparent 70%); }
        .nora-speaking .nora-orb-core, .nora-listening .nora-orb-core { animation:nora-pulse 2.1s ease-in-out infinite; }
        .nora-processing .nora-ring-a { animation-duration:2.4s; }
        .nora-processing .nora-ring-b { animation-duration:4s; }
        .nora-minimal .nora-orb-core { background:#03070c; box-shadow:0 0 24px var(--nora-accent), inset 0 0 30px rgba(80,160,255,.08); }
        .nora-minimal .nora-orb-flow, .nora-minimal .nora-orb-stars { opacity:.04; }
        .nora-waveform.nora-orb-shell, .nora-aurora.nora-orb-shell { transform:scaleX(1.08); }
        .nora-waveform .nora-orb-core, .nora-aurora .nora-orb-core { border-radius:46% 54% 48% 52% / 55% 44% 56% 45%; animation:nora-morph 7s ease-in-out infinite; }
        .nora-galaxy .nora-orb-stars { opacity:.95; animation:nora-spin 28s linear infinite; }
        .nora-ripple .nora-ring-a { inset:-7%; box-shadow:0 0 0 18px rgba(60,140,255,.035), 0 0 0 40px rgba(60,140,255,.02); }
        .nora-glass .nora-orb-core { border-radius:28%; transform:rotate(45deg); }
        .nora-glass .nora-orb-flow, .nora-glass .nora-orb-stars { transform:rotate(-45deg); }
        .nora-executive .nora-orb-core { box-shadow:0 0 34px color-mix(in srgb, var(--nora-accent) 60%, transparent), inset 0 0 62px rgba(0,0,0,.7); }
        .nora-earth .nora-orb-core { background:radial-gradient(circle at 44% 35%, rgba(90,170,255,.5), transparent 25%), radial-gradient(circle at 55% 65%, #0b3a72, #020611 63%); }
        .nora-holographic .nora-orb-core { background:repeating-radial-gradient(circle at center, rgba(64,160,255,.15) 0 2px, transparent 3px 9px), #020816; }
        .nora-wavebar { width:2px; height:8px; border-radius:9999px; background:var(--nora-accent); opacity:.45; }
        .nora-wavebar-live { animation:nora-wave 900ms ease-in-out infinite alternate; opacity:.95; box-shadow:0 0 7px var(--nora-accent); }
        .nora-glass-card { border:1px solid rgba(255,255,255,.09); background:rgba(9,17,30,.68); backdrop-filter:blur(18px); border-radius:18px; padding:12px 14px; font-size:12px; color:#e7edf5; box-shadow:0 12px 38px rgba(0,0,0,.24); }
        .nora-card-label { display:block; margin-bottom:4px; font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.19em; color:#718096; }
        .nora-processing-card { color:var(--nora-accent); }
        .nora-input { border:1px solid color-mix(in srgb, var(--nora-accent) 52%, rgba(255,255,255,.14)); border-radius:9999px; background:rgba(7,13,24,.72); backdrop-filter:blur(18px); box-shadow:0 0 24px rgba(0,0,0,.25), inset 0 0 22px rgba(255,255,255,.018); }
        .nora-action-button { min-width:48px; height:48px; border-radius:9999px; display:flex; align-items:center; justify-content:center; gap:6px; padding:0 13px; border:1px solid color-mix(in srgb, var(--nora-accent) 48%, rgba(255,255,255,.10)); background:rgba(7,13,24,.8); color:#ecf7ff; font-size:10px; box-shadow:0 0 18px color-mix(in srgb, var(--nora-accent) 14%, transparent); }
        .nora-mic-active { background:color-mix(in srgb, var(--nora-accent) 72%, #051427); color:#02101b; }
        .nora-end-button { border-color:rgba(255,70,70,.58); background:rgba(95,7,15,.58); box-shadow:0 0 20px rgba(255,30,45,.16); }
        @keyframes nora-spin { to { transform:rotate(360deg); } }
        @keyframes nora-spin-reverse { to { transform:rotate(-360deg); } }
        @keyframes nora-flow { from { transform:translateX(-8%) rotate(-12deg) scaleY(.8); } to { transform:translateX(8%) rotate(8deg) scaleY(1.18); } }
        @keyframes nora-pulse { 0%,100% { transform:scale(.97); filter:brightness(.92); } 50% { transform:scale(1.035); filter:brightness(1.18); } }
        @keyframes nora-wave { from { height:5px; } to { height:28px; } }
        @keyframes nora-morph { 0%,100% { border-radius:46% 54% 48% 52% / 55% 44% 56% 45%; } 50% { border-radius:56% 44% 58% 42% / 43% 58% 42% 57%; } }
        @media (max-height: 700px) {
          .nora-orb-shell { width:min(31vh, 210px); }
          .nora-glass-card { padding:9px 11px; }
        }
        @media (min-width: 700px) {
          .nora-orb-shell { width:min(35vw, 360px); }
        }
      `}</style>
    </>
  );
}
