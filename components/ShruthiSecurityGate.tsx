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
  isSecureUnlockAvailable?: () => boolean;
  requestSecureUnlock?: () => boolean;
  consumeSecureUnlockResult?: () => string;
};

type TranscriptEvent = CustomEvent<{ text?: string }>;

const TRUST_WINDOW_MS = 5 * 60_000;
const RELOCK_AFTER_MS = 5 * 60_000;
const IDENTITY_WINDOW_MS = 10_000;
const TRUST_KEY_PREFIX = 'centralhub:shruthi-security-trusted-until:';
const SHRUTHI_NAME = '(?:shruthi|shruti|sruthi|sruti|shrudhi|srudhi|shroothi|shrooti|sudhi|sudi|suthi|shudi|shuti|sweetie|sweety|ശ്രുതി|ശ്രൂതി|ஸ்ருதி|ஸ்ரூதி)';
const TINU_NAME = '(?:tinu|tino|teenu|tenu|jinu|jino|ginu|chino|cheenu)';
const SHRUTHI_SIGNAL = new RegExp(SHRUTHI_NAME, 'iu');
const TINU_SIGNAL = new RegExp(`\\b${TINU_NAME}\\b`, 'iu');
const SELF_IDENTITY_PHRASE = new RegExp(`(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b`, 'iu');
const FULL_IDENTITY_PHRASE = new RegExp(`${SHRUTHI_NAME}.*?(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b|(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b.*?${SHRUTHI_NAME}`, 'iu');
const WAKE_ONLY = new RegExp(`^(?:hi\\s+|hello\\s+|hey\\s+)?${SHRUTHI_NAME}[.!?\\s]*$`, 'iu');
const NORA_WAKE = /^(?:(?:hi|hello|hey)\s+)?nora[.!?\s]*$/iu;
const STOP_PHRASE = /^(?:(?:ok|okay|please|hey)\s+)?(?:stop|stop it|wait|pause|hold on|enough|quiet|shh)(?:\s+(?:please|now))?[.!?\s]*$|^(?:മതി|നിർത്തു|നിർത്തൂ|സ്റ്റോപ്പ്|போதும்|நிறுத்து|ஸ்டாப்)[.!?\s]*$/iu;

function nativeBridge(): NativeSecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeSecurityBridge }).CentralHubNative;
}

function trustKey(userId: string) {
  return `${TRUST_KEY_PREFIX}${userId}`;
}

function readTrustedUntil(userId: string) {
  if (typeof window === 'undefined' || !userId) return 0;
  try {
    const value = Number(window.sessionStorage.getItem(trustKey(userId)) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeTrustedUntil(userId: string, value: number) {
  if (typeof window === 'undefined' || !userId) return;
  try { window.sessionStorage.setItem(trustKey(userId), String(value)); } catch { }
}

function clearTrustedUntil(userId: string) {
  if (typeof window === 'undefined' || !userId) return;
  try { window.sessionStorage.removeItem(trustKey(userId)); } catch { }
}

export default function ShruthiSecurityGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const verifyTimerRef = useRef<number | null>(null);
  const verifyStartedAtRef = useRef(0);
  const identityArmedUntilRef = useRef(0);
  const [status, setStatus] = useState('Listening · say your security phrase');
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

  const ensureVoiceListening = useCallback(() => {
    if (!lockedRef.current) return;
    const bridge = nativeBridge();
    if (bridge?.getPlatform?.() !== 'android') return;
    try {
      // Keep one recognizer session alive. Do not use the old Off -> On hard reset:
      // Samsung plays a loud pair of system tones when SpeechRecognizer is cancelled
      // and restarted, and repeated resets also make wake recognition less reliable.
      bridge.setTaraEnabled?.(true);
      bridge.setNoraConversationActive?.(true);
      setStatus((current) => current.includes('verif') ? current : 'Listening · say “Hi Nora”');
    } catch { }
  }, []);

  const lock = useCallback(() => {
    clearVerifyPoll();
    identityArmedUntilRef.current = 0;
    const bridge = nativeBridge();
    if (!user || bridge?.getPlatform?.() !== 'android') {
      setGlobalLock(false);
      return;
    }

    setHeard('');
    setError('');
    setFallback(false);
    setStatus('Listening · say “Hi Nora”');
    setGlobalLock(true);
    try { bridge.stopTaraTts?.(); } catch { }
    window.setTimeout(ensureVoiceListening, 40);
  }, [clearVerifyPoll, ensureVoiceListening, setGlobalLock, user]);

  const unlock = useCallback(() => {
    clearVerifyPoll();
    identityArmedUntilRef.current = 0;
    const bridge = nativeBridge();
    setGlobalLock(false);
    setFallback(false);
    setPassword('');
    setError('');
    setStatus('Identity verified · CentralHub unlocked');
    if (user?.id) writeTrustedUntil(user.id, Date.now() + TRUST_WINDOW_MS);
    try { sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(Date.now())); } catch { }
    try {
      bridge?.stopTaraTts?.();
      bridge?.setNoraConversationActive?.(false);
      bridge?.setTaraEnabled?.(true);
    } catch { }
  }, [clearVerifyPoll, setGlobalLock, user?.id]);

  const beginSecureVerification = useCallback(() => {
    clearVerifyPoll();
    setError('');
    setStatus('Voice accepted · verify your device identity…');
    const bridge = nativeBridge();
    let started = false;
    try { started = bridge?.requestSecureUnlock?.() === true; } catch { started = false; }
    if (!started) {
      setStatus('Secure device verification unavailable');
      setError('Use Login ID & password, or tap Verify securely.');
      setFallback(true);
      ensureVoiceListening();
      return;
    }

    verifyStartedAtRef.current = Date.now();
    verifyTimerRef.current = window.setInterval(() => {
      let result = '';
      try { result = String(nativeBridge()?.consumeSecureUnlockResult?.() || ''); } catch { result = ''; }
      if (!result) {
        if (Date.now() - verifyStartedAtRef.current > 60_000) {
          clearVerifyPoll();
          setStatus('Identity verification timed out · listening again');
          setError('Try again or use Login ID & password.');
          setFallback(true);
          ensureVoiceListening();
        }
        return;
      }

      clearVerifyPoll();
      if (result === 'success') {
        unlock();
        return;
      }

      setStatus('Identity verification not completed · listening again');
      setError(result === 'cancelled' ? 'Verification cancelled. Say the phrase again or use secure login.' : 'Device identity did not verify. Try again or use secure login.');
      setFallback(true);
      ensureVoiceListening();
    }, 250);
  }, [clearVerifyPoll, ensureVoiceListening, unlock]);

  useEffect(() => {
    if (!user) {
      setGlobalLock(false);
      return;
    }

    if (readTrustedUntil(user.id) > Date.now()) {
      setGlobalLock(false);
      try {
        const bridge = nativeBridge();
        bridge?.setNoraConversationActive?.(false);
        bridge?.setTaraEnabled?.(true);
      } catch { }
    } else {
      clearTrustedUntil(user.id);
      lock();
    }

    return () => clearVerifyPoll();
  }, [clearVerifyPoll, lock, setGlobalLock, user?.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!user?.id) return;

      if (hiddenAt && now - hiddenAt >= RELOCK_AFTER_MS) {
        clearTrustedUntil(user.id);
        lock();
        return;
      }

      if (readTrustedUntil(user.id) > now) {
        setGlobalLock(false);
        return;
      }

      if (lockedRef.current) ensureVoiceListening();
      else {
        clearTrustedUntil(user.id);
        lock();
      }
    };

    const onFocus = () => {
      if (!user?.id) return;
      if (readTrustedUntil(user.id) > Date.now()) {
        setGlobalLock(false);
        return;
      }
      if (lockedRef.current) ensureVoiceListening();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [ensureVoiceListening, lock, setGlobalLock, user?.id]);

  useEffect(() => {
    const onTranscript = (event: Event) => {
      const custom = event as TranscriptEvent;
      const text = String(custom.detail?.text || '').trim();
      if (!text) return;

      if (lockedRef.current) {
        event.stopImmediatePropagation();
        if (NORA_WAKE.test(text)) {
          setHeard('');
          setError('');
          setStatus('NORA heard · starting secure device verification…');
          beginSecureVerification();
          return;
        }
        const body = text.replace(/^SHRUTHI\s*/i, '').trim();
        const now = Date.now();
        const wakeOnly = /^SHRUTHI[.!?\s]*$/i.test(text) || WAKE_ONLY.test(text);
        const fullIdentity = FULL_IDENTITY_PHRASE.test(text);
        const followUpIdentity = now < identityArmedUntilRef.current && SELF_IDENTITY_PHRASE.test(body || text);
        const mentionsShruthi = /SHRUTHI/i.test(text) || SHRUTHI_SIGNAL.test(text);
        const mentionsTinu = TINU_SIGNAL.test(text);

        if (!mentionsShruthi && !mentionsTinu && !followUpIdentity) {
          setStatus('Listening · focused on your security phrase');
          return;
        }

        setHeard('Voice activation detected');

        if (wakeOnly) {
          identityArmedUntilRef.current = now + IDENTITY_WINDOW_MS;
          setError('');
          setFallback(false);
          setStatus('NORA heard · secure verification required');
          return;
        }

        if (fullIdentity || followUpIdentity) {
          identityArmedUntilRef.current = 0;
          setError('');
          setStatus('Voice phrase accepted · starting secure verification…');
          beginSecureVerification();
          return;
        }

        if (mentionsShruthi) {
          identityArmedUntilRef.current = now + IDENTITY_WINDOW_MS;
          setError('');
          setStatus('NORA heard · secure verification required');
          return;
        }

        if (mentionsTinu && now < identityArmedUntilRef.current) {
          identityArmedUntilRef.current = 0;
          setError('');
          setStatus('Identity heard · starting secure verification…');
          beginSecureVerification();
          return;
        }

        setStatus('Almost there · still listening');
        setError('Say “Hi Nora” to start secure device verification, or use Login ID & password.');
        ensureVoiceListening();
        return;
      }

      const body = text.replace(/^SHRUTHI\s*/i, '').trim();
      if (STOP_PHRASE.test(body)) {
        event.stopImmediatePropagation();
        try { nativeBridge()?.stopTaraTts?.(); } catch { }
        const end = document.querySelector<HTMLButtonElement>('button[aria-label="End SHRUTHI conversation"]');
        if (end) end.click();
      }
    };

    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
    return () => window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
  }, [beginSecureVerification, ensureVoiceListening]);

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

  if (!locked || !user) return <>{children}</>;

  return (
    <section className="fixed inset-0 z-[320] overflow-y-auto bg-[#01040a] text-white" aria-label="NORA Secure Access">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(31,137,255,.20),transparent_31%),radial-gradient(circle_at_50%_85%,rgba(18,78,170,.10),transparent_35%)]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col items-center justify-center px-5 py-[max(28px,env(safe-area-inset-top))] text-center">
        <div className="mb-7 flex items-center gap-2 text-sm font-semibold tracking-[0.28em] text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" /> CENTRALHUB SECURE ACCESS</div>
        <div className="relative mx-auto aspect-[2.7] w-full max-w-[680px] overflow-hidden" aria-label="NORA AI assistant artwork">
          <img src="/nora-secure-access.webp" alt="NORA glowing blue AI orb with holographic light rings" className="pointer-events-none absolute inset-x-0 top-0 h-auto w-full max-w-none select-none" style={{ transform: 'translateY(-7%)' }} draggable={false} />
        </div>
        <h1 className="mt-3 text-4xl font-light tracking-[0.08em] sm:text-5xl">NORA</h1>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-300">Security · Identity · Access</p>

        <div className="mt-8 w-full max-w-xl rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-center gap-2 text-cyan-200"><Mic className="h-5 w-5" /><span className="font-semibold">{status}</span></div>
          <p className="mt-3 text-sm text-slate-400">Say naturally:</p>
          <p className="mt-1 text-lg font-medium text-white">“Hi Nora.”</p>
          <p className="mt-1 text-xs text-slate-500">Voice activation begins secure device verification. Saying “Hi Nora” alone never unlocks CentralHub.</p>
          {heard && <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">Heard: {heard}</p>}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">NORA stays silent while listening so her own speaker does not interfere. Android biometric/device credential performs the actual identity verification; speech-to-text alone is not treated as a secure voiceprint.</p>
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
        <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-600"><LockKeyhole className="h-3.5 w-3.5" /> Trusted for 5 minutes · relocks after 5 minutes away</div>
      </div>
    </section>
  );
}
