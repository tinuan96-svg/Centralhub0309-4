'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, LockKeyhole, Mic, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { AuthService } from '@/lib/services/authService';

type NativeSecurityBridge = {
  getPlatform?: () => string;
  setTaraEnabled?: (enabled: boolean) => void;
  setNoraConversationActive?: (active: boolean) => void;
  stopTaraTts?: () => void;
  speakTara?: (text: string, languageTag: string) => boolean;
  isSecureUnlockAvailable?: () => boolean;
  requestSecureUnlock?: () => boolean;
  consumeSecureUnlockResult?: () => string;
};

type TranscriptEvent = CustomEvent<{ text?: string }>;

const RELOCK_AFTER_MS = 30_000;
const IDENTITY_PHRASE = /(?:shruthi|shruti|sruthi|sruti|ശ്രുതി|ശ്രൂതി|ஸ்ருதி|ஸ்ரூதி).*?(?:this\s+is|i\s+am|i'?m|its|it's)\s+tinu\b|(?:this\s+is|i\s+am|i'?m|its|it's)\s+tinu\b.*?(?:shruthi|shruti|sruthi|sruti|ശ്രുതി|ശ്രൂതി|ஸ்ருதி|ஸ்ரூதி)/iu;
const STOP_PHRASE = /^(?:(?:ok|okay|please|hey)\s+)?(?:stop|stop it|wait|pause|hold on|enough|quiet|shh)(?:\s+(?:please|now))?[.!?\s]*$|^(?:മതി|നിർത്തു|നിർത്തൂ|സ്റ്റോപ്പ്|போதும்|நிறுத்து|ஸ்டாப்)[.!?\s]*$/iu;

function nativeBridge(): NativeSecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeSecurityBridge }).CentralHubNative;
}

export default function ShruthiSecurityGate() {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const verifyTimerRef = useRef<number | null>(null);
  const verifyStartedAtRef = useRef(0);
  const [status, setStatus] = useState('Voice activation required');
  const [heard, setHeard] = useState('');
  const [fallback, setFallback] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);

  const clearVerifyPoll = useCallback(() => {
    if (verifyTimerRef.current) window.clearInterval(verifyTimerRef.current);
    verifyTimerRef.current = null;
    verifyStartedAtRef.current = 0;
  }, []);

  const setGlobalLock = useCallback((value: boolean) => {
    lockedRef.current = value;
    setLocked(value);
    if (typeof window !== 'undefined') (window as any).__centralHubSecurityLocked = value;
  }, []);

  const lock = useCallback(() => {
    clearVerifyPoll();
    const bridge = nativeBridge();
    if (!user || bridge?.getPlatform?.() !== 'android') {
      setGlobalLock(false);
      return;
    }
    setHeard('');
    setError('');
    setFallback(false);
    setStatus('Voice activation required');
    setGlobalLock(true);
    try {
      bridge.setTaraEnabled?.(true);
      bridge.setNoraConversationActive?.(true);
      window.setTimeout(() => {
        try { bridge.speakTara?.('Security check. Please identify yourself to continue.', 'en-GB'); } catch { /* visual prompt remains */ }
      }, 220);
    } catch { /* fallback remains available */ }
  }, [clearVerifyPoll, setGlobalLock, user]);

  const unlock = useCallback(() => {
    clearVerifyPoll();
    const bridge = nativeBridge();
    setGlobalLock(false);
    setFallback(false);
    setPassword('');
    setError('');
    setStatus('Identity verified · CentralHub unlocked');
    try { sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(Date.now())); } catch { /* no-op */ }
    try {
      bridge?.stopTaraTts?.();
      bridge?.setNoraConversationActive?.(false);
      bridge?.setTaraEnabled?.(true);
    } catch { /* passive wake remains best-effort */ }
  }, [clearVerifyPoll, setGlobalLock]);

  const beginSecureVerification = useCallback(() => {
    clearVerifyPoll();
    setError('');
    setStatus('Waiting for secure device verification…');
    const bridge = nativeBridge();
    let started = false;
    try { started = bridge?.requestSecureUnlock?.() === true; } catch { started = false; }
    if (!started) {
      setStatus('Secure device verification unavailable');
      setFallback(true);
      return;
    }

    verifyStartedAtRef.current = Date.now();
    verifyTimerRef.current = window.setInterval(() => {
      let result = '';
      try { result = String(nativeBridge()?.consumeSecureUnlockResult?.() || ''); } catch { result = ''; }
      if (!result) {
        if (Date.now() - verifyStartedAtRef.current > 60_000) {
          clearVerifyPoll();
          setStatus('Identity verification timed out');
          setError('Try again or use login ID and password.');
          setFallback(true);
        }
        return;
      }

      clearVerifyPoll();
      if (result === 'success') {
        unlock();
        return;
      }
      setStatus('Identity verification not completed');
      setError(result === 'cancelled' ? 'Verification cancelled. Try again or use secure login.' : 'Device identity did not verify. Try again or use secure login.');
      setFallback(true);
    }, 300);
  }, [clearVerifyPoll, unlock]);

  useEffect(() => {
    if (!user) {
      setGlobalLock(false);
      return;
    }
    lock();
    return () => clearVerifyPoll();
  }, [clearVerifyPoll, lock, setGlobalLock, user?.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS) lock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lock]);

  useEffect(() => {
    const onTranscript = (event: Event) => {
      const custom = event as TranscriptEvent;
      const text = String(custom.detail?.text || '').trim();
      if (!text) return;

      if (lockedRef.current) {
        event.stopImmediatePropagation();
        setHeard(text.replace(/^SHRUTHI\s*/i, '').trim() || text);
        if (!IDENTITY_PHRASE.test(text)) {
          setStatus('Voice phrase not recognised');
          setError('Say: “Hi Shruthi, this is Tinu.” Or use secure login.');
          return;
        }

        setError('');
        setStatus('Voice phrase accepted · verifying device identity…');
        beginSecureVerification();
        return;
      }

      const body = text.replace(/^SHRUTHI\s*/i, '').trim();
      if (STOP_PHRASE.test(body)) {
        event.stopImmediatePropagation();
        try { nativeBridge()?.stopTaraTts?.(); } catch { /* no-op */ }
        const end = document.querySelector<HTMLButtonElement>('button[aria-label="End SHRUTHI conversation"]');
        if (end) end.click();
      }
    };

    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
    return () => window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
  }, [beginSecureVerification]);

  const passwordLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const result = await AuthService.signIn(email.trim(), password);
      if (!result?.user) throw new Error('Account verification failed.');
      unlock();
    } catch (e: any) {
      setError(e?.message || 'Login ID or password did not verify.');
    } finally {
      setBusy(false);
    }
  };

  if (!locked || !user) return null;

  return (
    <section className="fixed inset-0 z-[320] overflow-y-auto bg-[#01040a] text-white" aria-label="Shruthi Security Login">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(31,137,255,.20),transparent_31%),radial-gradient(circle_at_50%_85%,rgba(18,78,170,.10),transparent_35%)]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col items-center justify-center px-5 py-[max(28px,env(safe-area-inset-top))] text-center">
        <div className="mb-7 flex items-center gap-2 text-sm font-semibold tracking-[0.28em] text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" /> CENTRALHUB SECURE ACCESS</div>
        <div className="relative h-44 w-44 sm:h-56 sm:w-56">
          <div className="absolute inset-0 animate-pulse rounded-full border border-cyan-300/20 shadow-[0_0_70px_rgba(61,180,255,.20)]" />
          <div className="absolute inset-3 rounded-full border border-blue-400/30" />
          <img src="/shruthi-avatar.png" alt="Shruthi" className="absolute inset-5 h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)] rounded-full object-cover object-top shadow-2xl" />
        </div>
        <h1 className="mt-7 text-4xl font-light tracking-[0.08em] sm:text-5xl">SHRUTHI</h1>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-300">Security · Identity · Access</p>

        <div className="mt-8 w-full max-w-xl rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-center gap-2 text-cyan-200"><Mic className="h-5 w-5" /><span className="font-semibold">{status}</span></div>
          <p className="mt-3 text-sm text-slate-400">Say naturally:</p>
          <p className="mt-1 text-lg font-medium text-white">“Hi Shruthi, this is Tinu.”</p>
          {heard && <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">Heard: {heard}</p>}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">The spoken phrase starts the security flow. Android biometric/device credential performs the actual identity verification; speech-to-text alone is never treated as a secure voiceprint.</p>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={beginSecureVerification} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100"><Fingerprint className="h-4 w-4" /> Verify securely</button>
            <button type="button" onClick={() => setFallback((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-200"><KeyRound className="h-4 w-4" /> Login ID & password</button>
          </div>

          {fallback && (
            <form onSubmit={passwordLogin} className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Login ID
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
              </label>
              <button type="submit" disabled={busy || !email.trim() || !password} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{busy ? 'Verifying…' : 'Unlock CentralHub'}</button>
            </form>
          )}
        </div>
        <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-600"><LockKeyhole className="h-3.5 w-3.5" /> Relocks after 30 seconds away from the app</div>
      </div>
    </section>
  );
}
