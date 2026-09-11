'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

const QUICK_PROMPTS: Record<AssistantMode, string[]> = {
  operations: ['What needs attention now?', 'Give me a full operations scan', 'How are sales and profit doing?'],
  board: ['Start a board briefing', 'What are the main risks?', 'Give me decisions and priorities'],
  developer: ['Check current CentralHub health', 'What technical issues need attention?', 'Explain the safest next fix'],
};

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
    throw new Error(detail || error.message || 'CentralHub Voice request failed.');
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const isDashboard = pathname === '/dashboard';
  const fabPosition = isDashboard
    ? 'right-[5rem] sm:right-[5.5rem] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6'
    : 'right-4 sm:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6';

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  };

  useEffect(() => () => {
    stopTracks();
    window.speechSynthesis?.cancel();
  }, []);

  const speak = (text: string) => {
    if (!autoSpeak || !text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
    utterance.lang = hasMalayalam ? 'ml-IN' : 'en-GB';
    utterance.rate = 0.98;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((voice) => voice.lang.toLowerCase().startsWith(hasMalayalam ? 'ml' : 'en-gb'));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  };

  const runCommand = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setProcessing(true);
    setError('');
    setTranscript(clean);
    setResponse(null);
    try {
      const result = await invokeVoice({ action: 'command', text: clean, mode });
      if (!result.success || !result.reply) throw new Error(result.error || 'CentralHub Voice could not answer.');
      setResponse(result);
      if (result.speak !== false) speak(result.reply);
    } catch (e: any) {
      setError(e?.message || 'CentralHub Voice failed.');
    } finally {
      setProcessing(false);
    }
  };

  const transcribeAndRun = async (blob: Blob) => {
    setProcessing(true);
    setError('');
    try {
      const audioBase64 = await blobToBase64(blob);
      const data = await invokeVoice({ action: 'transcribe', audioBase64, mimeType: blob.type || 'audio/webm' });
      const text = String(data?.transcript || '').trim();
      if (!data?.success || !text) throw new Error(data?.error || 'I could not hear that clearly.');
      setInput('');
      await runCommand(text);
    } catch (e: any) {
      setProcessing(false);
      setError(e?.message || 'Voice transcription failed.');
    }
  };

  const startRecording = async () => {
    if (processing || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported on this device. You can still type a command.');
      setOpen(true);
      return;
    }
    setOpen(true);
    setError('');
    setResponse(null);
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
        stopTracks();
        if (blob.size > 100) void transcribeAndRun(blob);
        else setError('No voice was captured. Try again.');
      };
      recorder.start(250);
      setRecording(true);
      stopTimerRef.current = window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), 45_000);
    } catch (e: any) {
      stopTracks();
      setRecording(false);
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
    setOpen(false);
  };

  const statusText = useMemo(() => {
    if (recording) return 'Listening… tap stop when finished';
    if (processing) return 'CentralHub is working…';
    return 'Tap the mic and speak naturally in Malayalam, English, or both.';
  }, [recording, processing]);

  return (
    <>
      {open && (
        <section className="fixed z-[85] right-3 left-3 bottom-[calc(10rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-24 sm:w-[min(92vw,460px)] rounded-3xl border border-cyan-500/25 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden" aria-label="CentralHub Voice Assistant">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center"><Bot size={19} /></div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white">CentralHub Voice</p>
                <p className="text-[10px] text-slate-400 truncate">Private business copilot · read-first safety</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setAutoSpeak((v) => !v); window.speechSynthesis?.cancel(); }} className="h-9 w-9 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 flex items-center justify-center" aria-label={autoSpeak ? 'Mute voice replies' : 'Enable voice replies'}>{autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <button type="button" onClick={close} className="h-9 w-9 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 flex items-center justify-center" aria-label="Close CentralHub Voice"><X size={17} /></button>
            </div>
          </div>

          <div className="px-4 pt-3 flex gap-2">
            {(['operations','board','developer'] as AssistantMode[]).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} className={`flex-1 rounded-xl border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === item ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-slate-800 bg-slate-900/70 text-slate-500'}`}>{item}</button>
            ))}
          </div>

          <div className="p-4 space-y-3 max-h-[58vh] overflow-y-auto overscroll-contain">
            <div className={`rounded-2xl border p-3 ${recording ? 'border-rose-400/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="flex items-center gap-3">
                <button type="button" disabled={processing} onClick={recording ? stopRecording : startRecording} className={`h-12 w-12 shrink-0 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-50 ${recording ? 'border-rose-300 bg-rose-500 text-white animate-pulse' : 'border-cyan-300/40 bg-cyan-500 text-slate-950'}`} aria-label={recording ? 'Stop recording' : 'Start voice command'}>{recording ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}</button>
                <div className="min-w-0"><p className="text-xs font-bold text-slate-100">{statusText}</p><p className="mt-1 text-[10px] text-slate-500">Maximum 45 seconds per command in this first release.</p></div>
              </div>
            </div>

            {!transcript && !response && !processing && (
              <div className="flex flex-wrap gap-2">{QUICK_PROMPTS[mode].map((prompt) => <button key={prompt} type="button" onClick={() => void runCommand(prompt)} className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:border-cyan-500/40">{prompt}</button>)}</div>
            )}

            {transcript && <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">You said</p><p className="mt-1 text-xs text-slate-200">{transcript}</p></div>}
            {processing && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200">Analysing live CentralHub data…</div>}
            {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}

            {response?.reply && (
              <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/8 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-widest text-cyan-300">CentralHub</p><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${response.requires_confirmation ? 'border-amber-400/40 text-amber-200' : 'border-emerald-500/30 text-emerald-200'}`}>{response.requires_confirmation ? 'confirmation required' : response.risk_level || 'read only'}</span></div>
                <p className="mt-2 text-sm leading-relaxed text-slate-100">{response.reply}</p>
                {response.requires_confirmation && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-[10px] text-amber-100">No write action was executed. This first release deliberately gates deploys, code/database changes, pricing, refunds, messages and other external actions.</div>}
                {response.navigation_path && <button type="button" onClick={() => { router.push(response.navigation_path!); setOpen(false); }} className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-cyan-200">Open related page</button>}
              </div>
            )}

            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = input.trim(); if (!value) return; setInput(''); void runCommand(value); }}>
              <input value={input} onChange={(event) => setInput(event.target.value)} disabled={processing || recording} placeholder="Or type a command…" className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-500/40" />
              <button type="submit" disabled={!input.trim() || processing || recording} className="h-10 w-10 rounded-xl border border-cyan-400/30 bg-cyan-500 text-slate-950 flex items-center justify-center disabled:opacity-40" aria-label="Send command"><Send size={16} /></button>
            </form>
          </div>
        </section>
      )}

      <button type="button" onClick={() => { if (open) close(); else void startRecording(); }} className={`fixed z-[80] ${fabPosition} h-14 w-14 rounded-full border-2 flex items-center justify-center shadow-2xl transition-all active:scale-95 touch-manipulation ${recording ? 'border-rose-200 bg-rose-500 text-white shadow-rose-950/40 animate-pulse' : open ? 'border-cyan-200/40 bg-slate-800 text-cyan-200' : 'border-white/15 bg-cyan-500 text-slate-950 shadow-cyan-950/40'}`} aria-label={open ? 'Close CentralHub Voice' : 'Talk to CentralHub'}>{recording ? <MicOff size={22} /> : <Mic size={22} />}</button>
    </>
  );
}
