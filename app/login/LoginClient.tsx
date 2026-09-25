'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NoraOrb from './NoraOrb';
import loginLayout from './LoginResponsive.module.css';
import { ArrowRight, Fingerprint, KeyRound, LockKeyhole, MessageCircle, Mic, PlayCircle, ShieldCheck } from 'lucide-react';
import { AuthService } from '@/lib/services/authService';
import { OTPService } from '@/lib/services/comm/otpService';
import { supabase } from '@/lib/supabase';

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

// Share the existing account-scoped trust marker with the dashboard security gate.
// Only set this after successful authentication or Android device verification.
const SECURITY_TRUST_PREFIX = 'centralhub:shruthi-security-trusted-until:';
const SECURITY_TRUST_MS = 5 * 60_000;
function rememberVerifiedLogin(userId: string) {
  if (!userId || typeof window === 'undefined') return;
  try {
    const now = Date.now();
    sessionStorage.setItem(SECURITY_TRUST_PREFIX + userId, String(now + SECURITY_TRUST_MS));
    sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(now));
  } catch { }
}

// Wake-up speech only starts the existing protected-session and device
// verification flow. It never authenticates or bypasses Supabase access.
const NORA_WAKE = /^(?:(?:hi|hello|hey)\s+)?nora[.!?\s]*$/iu;

function bridge(): NativeSecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeSecurityBridge }).CentralHubNative;
}

export default function LoginClient({ params, searchParams }: { params: any; searchParams: any }) {
  void params;
  void searchParams;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [mode, setMode] = useState<'password' | 'whatsapp'>('password');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [requestId, setRequestId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Listening · say “Hi Nora”');
  const [heard, setHeard] = useState('');
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [staffLoginSelected, setStaffLoginSelected] = useState(false);
  const verifyTimerRef = useRef<number | null>(null);
  const router = useRouter();

  const clearVerifyPoll = useCallback(() => {
    if (verifyTimerRef.current) window.clearInterval(verifyTimerRef.current);
    verifyTimerRef.current = null;
  }, []);

  const ensureVoiceListening = useCallback(() => {
    const native = bridge();
    if (native?.getPlatform?.() !== 'android') {
      setStatus('NORA ready · use secure login or the Android app for voice');
      return;
    }
    try {
      // Never force an Off -> On cycle here. Samsung SpeechRecognizer emits a
      // loud start/stop tone when cancelled and recreated. Repeated `true` calls
      // are intentionally idempotent in the native bridge.
      native.setTaraEnabled?.(true);
      native.setNoraConversationActive?.(true);
      setStatus((current) => current.includes('verif') ? current : 'Listening · say “Hi Nora”');
    } catch { }
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('stores').select('id, name').order('name');
      if (data) {
        setStores(data);
        if (data.length > 0) setSelectedStoreId(data[0].id);
      }
    })();

    const native = bridge();
    try { native?.stopTaraTts?.(); } catch { }
    ensureVoiceListening();

    const onVisible = () => {
      if (document.visibilityState === 'visible') ensureVoiceListening();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearVerifyPoll();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      try { native?.setNoraConversationActive?.(false); } catch { }
      // Do not disable or destroy the native recognizer on route cleanup. The
      // Android activity owns its lifetime and keeps passive wake available.
    };
  }, [clearVerifyPoll, ensureVoiceListening]);

  const completeReturningUserUnlock = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      setStatus('NORA heard · secure login required');
      setFallbackVisible(true);
      return;
    }

    const native = bridge();
    let started = false;
    try { started = native?.requestSecureUnlock?.() === true; } catch { started = false; }
    if (!started) {
      setStatus('Secure device verification unavailable');
      setFallbackVisible(true);
      setError('Use your login ID and password to continue.');
      return;
    }

    setStatus('NORA heard · verifying device identity…');
    clearVerifyPoll();
    const startedAt = Date.now();
    verifyTimerRef.current = window.setInterval(() => {
      let result = '';
      try { result = String(bridge()?.consumeSecureUnlockResult?.() || ''); } catch { result = ''; }
      if (!result) {
        if (Date.now() - startedAt > 60_000) {
          clearVerifyPoll();
          setStatus('Verification timed out · listening again');
          setFallbackVisible(true);
          ensureVoiceListening();
        }
        return;
      }

      clearVerifyPoll();
      if (result === 'success') {
        setStatus('Identity verified · unlocking CentralHub');
        rememberVerifiedLogin(session.user.id);
        router.replace('/dashboard');
        return;
      }

      setStatus('Identity verification did not complete · listening again');
      setError('Try again or use your login ID and password.');
      setFallbackVisible(true);
      ensureVoiceListening();
    }, 250);
  }, [clearVerifyPoll, ensureVoiceListening, router]);

  useEffect(() => {
    const onTranscript = (event: Event) => {
      const text = String((event as TranscriptEvent).detail?.text || '').trim();
      if (!text) return;
      event.stopImmediatePropagation();

      if (!NORA_WAKE.test(text)) return;
      setHeard('');
      setError('');
      setStatus('NORA heard · starting secure device verification…');
      // Existing session and Android biometric/device credential are mandatory.
      void completeReturningUserUnlock();
    };

    window.addEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
    return () => window.removeEventListener('centralhub:tara-transcript', onTranscript as EventListener, true);
  }, [completeReturningUserUnlock, ensureVoiceListening]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const signedIn = await AuthService.signIn(email, password);
      const staffLogin = signedIn.user?.app_metadata?.role === 'staff';
      if (!staffLogin) {
        rememberVerifiedLogin(signedIn.user.id);
      } else {
        // Staff passwords do not satisfy the Super Admin's voice/biometric gate.
        try { sessionStorage.removeItem('centralhub:shruthi-security-unlocked-at'); } catch { }
      }
      setStatus(staffLogin ? 'Staff login verified · checking assigned access' : 'Login verified · unlocking CentralHub');
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login ID or password did not verify.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (!selectedStoreId) throw new Error('Please select a store');
      const res = await OTPService.sendOTP(phone, selectedStoreId);
      if (res.success && res.request_id) {
        setRequestId(res.request_id);
        setStep('verify');
      } else setError(res.error || 'Failed to send OTP');
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (!requestId || !selectedStoreId) throw new Error('Your OTP session has expired. Please request a new code.');
      const res = await OTPService.verifyOTP(requestId, otp, selectedStoreId);
      if (res.success && res.session_tokens?.email_otp && res.user?.email) {
        const { data: otpSession, error: authError } = await supabase.auth.verifyOtp({ email: res.user.email, token: res.session_tokens.email_otp, type: 'magiclink' });
        if (authError) throw authError;
        if (otpSession.user?.app_metadata?.role !== 'staff' && otpSession.user?.id) rememberVerifiedLogin(otpSession.user.id);
        setStatus('WhatsApp verification complete · unlocking CentralHub');
        router.replace('/dashboard');
      } else setError(res.error || 'Invalid OTP');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#030b1b] px-3 pb-[max(48px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] text-white sm:px-6 sm:pb-8 sm:pt-[max(20px,env(safe-area-inset-top))]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_16%,rgba(0,117,255,.18),transparent_50%),radial-gradient(circle_at_50%_80%,rgba(8,84,180,.14),transparent_48%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] opacity-50 [background-image:radial-gradient(circle,rgba(68,185,255,.75)_0.6px,transparent_1.5px)] [background-size:67px_59px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <section className={`relative mx-auto flex w-full max-w-[780px] flex-1 flex-col items-center justify-center py-2 text-center sm:py-6 ${loginLayout.content}`}>
        <div className="mb-0.5 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300 sm:mb-1 sm:gap-2 sm:text-xs sm:tracking-[0.36em]"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-300 sm:h-5 sm:w-5" /> CentralHub Secure Access</div>

        <NoraOrb phase={/verif|unloc/i.test(status) ? 'verifying' : /listening/i.test(status) ? 'listening' : 'idle'} />

        <h1 className="relative z-10 mt-2 text-[clamp(2rem,8vw,4.2rem)] font-light leading-none tracking-[0.19em] text-slate-50 [text-shadow:0_0_30px_rgba(93,205,255,0.4)] sm:mt-3">NORA</h1>
        <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200 sm:mt-3 sm:text-xs sm:tracking-[0.38em]">Security · Identity · Access</p>
        <div aria-hidden="true" className="mt-2 h-px w-20 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_18px_2px_rgba(34,211,238,.45)] sm:mt-4" />

        <div className="mt-4 w-full rounded-[1.4rem] border border-cyan-300/35 bg-gradient-to-b from-[#0b2344]/90 via-[#07162e]/95 to-[#071224]/95 p-3 shadow-[0_24px_95px_rgba(0,0,0,.55),0_0_35px_rgba(16,124,255,.13)] backdrop-blur-xl sm:mt-7 sm:rounded-[2rem] sm:p-7">
          <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-cyan-50"><span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_22px_rgba(14,177,255,.3)] sm:h-11 sm:w-11"><span aria-hidden="true" className="absolute -inset-1 rounded-full border border-cyan-300/30 motion-safe:animate-pulse" /><Mic aria-hidden="true" className="relative h-4 w-4 sm:h-5 sm:w-5" /></span><span className="text-xs font-semibold leading-4 sm:text-base">{status}</span></div>
          {/listening/i.test(status) ? (
            <p className="mt-1.5 text-sm font-semibold text-cyan-50 sm:mt-3">Say “Hi Nora” to start secure device verification.</p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-slate-300 sm:mt-3 sm:text-sm">Use secure login below. Voice wake-up is available in the CentralHub Android app.</p>
          )}
          {heard && <p className="mt-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">Heard: {heard}</p>}
          <details className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-slate-400 sm:mt-3">
            <summary className="cursor-pointer rounded-md py-1 text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">How NORA secure access works</summary>
            <p className="mt-1">NORA stays silent while listening so her own speaker does not interfere. Voice wake-up requires the CentralHub Android app. Returning sessions must pass Android biometric or device-credential verification before CentralHub opens.</p>
          </details>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

<div className="mt-2 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-2.5">
            <button type="button" onClick={() => void completeReturningUserUnlock()} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-cyan-200/50 bg-gradient-to-r from-cyan-400 to-blue-600 px-2 py-2 text-[11px] sm:px-4 sm:py-3 sm:text-sm font-bold text-white shadow-[0_4px_20px_rgba(0,149,255,.24)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"><Fingerprint aria-hidden="true" className="h-4 w-4" /> Verify this device <ArrowRight aria-hidden="true" className="hidden h-4 w-4 sm:block" /></button>
            <button type="button" aria-expanded={fallbackVisible && mode === 'password'} onClick={() => { setMode('password'); setFallbackVisible(value => !value || mode !== 'password'); }} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-cyan-200/30 bg-[#0d2840]/70 px-2 py-2 text-[11px] sm:px-4 sm:py-3 sm:text-sm font-semibold text-slate-50 transition hover:border-cyan-300/60 hover:bg-[#10334e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"><KeyRound aria-hidden="true" className="h-4 w-4" /> Login ID & password <ArrowRight aria-hidden="true" className="hidden h-4 w-4 sm:block" /></button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-1 sm:gap-3">
          <button type="button" onClick={() => {
            setStaffLoginSelected(true);
            setFallbackVisible(true);
            setMode('password');
            setError('');
            setStatus('Staff login · enter your work email and temporary or personal password');
          }} className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-cyan-300/35 bg-[#0d2840]/80 px-2 py-2 text-[11px] sm:px-4 sm:py-3 sm:text-sm font-semibold text-cyan-50 transition hover:bg-[#10344d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
            <KeyRound aria-hidden="true" className="h-4 w-4" /> Staff login <ArrowRight aria-hidden="true" className="hidden h-4 w-4 sm:block" />
          </button>
          <Link
            href="/demo"
            prefetch={false}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-cyan-300/35 bg-[#0d2840]/80 px-2 py-2 text-[11px] sm:px-4 sm:py-3 sm:text-sm font-semibold text-cyan-50 transition hover:border-cyan-300/60 hover:bg-[#10344d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" /> Try Demo Data <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
          </Link>
          </div>
          {staffLoginSelected&&<p className="mt-2 text-xs text-slate-300">Staff accounts use their own email and password. Your Super Admin must activate the account before you can access assigned work sections.</p>}

          <p className="mt-2 text-xs text-slate-500">Explore a sample CentralHub dashboard without logging in. No live business data or transactions.</p>

          {fallbackVisible && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.035] p-1">
                <button type="button" onClick={() => setMode('password')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'password' ? 'bg-cyan-300 text-slate-950' : 'text-slate-400'}`}>Secure login</button>
                <button type="button" onClick={() => setMode('whatsapp')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'whatsapp' ? 'bg-cyan-300 text-slate-950' : 'text-slate-400'}`}>WhatsApp code</button>
              </div>

              {mode === 'password' ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Login ID
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <button type="submit" disabled={isLoading || !email.trim() || !password} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{isLoading ? 'Verifying…' : 'Unlock CentralHub'}</button>
                </form>
              ) : step === 'request' ? (
                <form onSubmit={handleRequestOTP} className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Store
                    <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50">
                      {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">WhatsApp number
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+44…" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <button type="submit" disabled={isLoading || !selectedStoreId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><MessageCircle className="h-4 w-4" />{isLoading ? 'Sending…' : 'Send login code'}</button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-3">
                  <label className="block text-center text-xs font-semibold uppercase tracking-wider text-slate-500">6-digit code
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-center text-2xl font-bold tracking-[0.35em] text-white outline-none focus:border-cyan-400/50" />
                  </label>
                  <button type="submit" disabled={isLoading || otp.length !== 6} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{isLoading ? 'Verifying…' : 'Verify & unlock'}</button>
                  <button type="button" onClick={() => { setStep('request'); setOtp(''); setRequestId(''); }} className="w-full py-1 text-center text-xs text-slate-500">Change number</button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex max-w-full items-center justify-center gap-2 text-center text-[10px] uppercase leading-5 tracking-[0.11em] text-slate-400 sm:tracking-[0.22em]"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> NORA remains the access gate whenever CentralHub starts</div>
      </section>
    </main>
  );
}
