'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, KeyRound, LockKeyhole, MessageCircle, Mic, ShieldCheck } from 'lucide-react';
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

const IDENTITY_WINDOW_MS = 10_000;
const SHRUTHI_NAME = '(?:shruthi|shruti|sruthi|sruti|shrudhi|srudhi|shroothi|shrooti|sudhi|sudi|suthi|shudi|shuti|sweetie|sweety|ശ്രുതി|ശ്രൂതി|ஸ்ருதி|ஸ்ரூதி)';
const TINU_NAME = '(?:tinu|tino|teenu|tenu|jinu|jino|ginu|chino|cheenu)';
const SHRUTHI_SIGNAL = new RegExp(SHRUTHI_NAME, 'iu');
const TINU_SIGNAL = new RegExp(`\\b${TINU_NAME}\\b`, 'iu');
const SELF_IDENTITY_PHRASE = new RegExp(`(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b`, 'iu');
const FULL_IDENTITY_PHRASE = new RegExp(`${SHRUTHI_NAME}.*?(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b|(?:this\\s+is|i\\s+am|i'?m|it\\s+is|its|it's)\\s+${TINU_NAME}\\b.*?${SHRUTHI_NAME}`, 'iu');
const WAKE_ONLY = new RegExp(`^(?:hi\\s+|hello\\s+|hey\\s+)?${SHRUTHI_NAME}[.!?\\s]*$`, 'iu');

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
  const [status, setStatus] = useState('Listening · say “Hi Shruthi, this is Tinu”');
  const [heard, setHeard] = useState('');
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [staffLoginSelected, setStaffLoginSelected] = useState(false);
  const verifyTimerRef = useRef<number | null>(null);
  const identityArmedUntilRef = useRef(0);
  const router = useRouter();

  const clearVerifyPoll = useCallback(() => {
    if (verifyTimerRef.current) window.clearInterval(verifyTimerRef.current);
    verifyTimerRef.current = null;
  }, []);

  const ensureVoiceListening = useCallback(() => {
    const native = bridge();
    if (native?.getPlatform?.() !== 'android') return;
    try {
      // Never force an Off -> On cycle here. Samsung SpeechRecognizer emits a
      // loud start/stop tone when cancelled and recreated. Repeated `true` calls
      // are intentionally idempotent in the native bridge.
      native.setTaraEnabled?.(true);
      native.setNoraConversationActive?.(true);
      setStatus((current) => current.includes('verif') ? current : 'Listening · say “Hi Shruthi, this is Tinu”');
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
      setStatus('Voice accepted · secure login required');
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

    setStatus('Voice accepted · verifying device identity…');
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
        try { sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(Date.now())); } catch { }
        router.replace('/dashboard');
        return;
      }

      setStatus('Identity verification did not complete · listening again');
      setError('Try the phrase again or use your login ID and password.');
      setFallbackVisible(true);
      ensureVoiceListening();
    }, 250);
  }, [clearVerifyPoll, ensureVoiceListening, router]);

  useEffect(() => {
    const onTranscript = (event: Event) => {
      const text = String((event as TranscriptEvent).detail?.text || '').trim();
      if (!text) return;
      event.stopImmediatePropagation();

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

      setHeard(body || text);

      if (wakeOnly) {
        identityArmedUntilRef.current = now + IDENTITY_WINDOW_MS;
        setError('');
        setFallbackVisible(false);
        setStatus('Shruthi heard · now say “This is Tinu”');
        return;
      }

      if (fullIdentity || followUpIdentity) {
        identityArmedUntilRef.current = 0;
        setError('');
        setStatus('Voice activation accepted');
        void completeReturningUserUnlock();
        return;
      }

      if (mentionsShruthi) {
        identityArmedUntilRef.current = now + IDENTITY_WINDOW_MS;
        setError('');
        setStatus('Shruthi heard · say “This is Tinu”');
        return;
      }

      if (mentionsTinu && now < identityArmedUntilRef.current) {
        identityArmedUntilRef.current = 0;
        setError('');
        setStatus('Identity heard · starting secure verification…');
        void completeReturningUserUnlock();
        return;
      }

      setStatus('Almost there · still listening');
      setError('Say “Shruthi” then “This is Tinu”, or say the full phrase naturally.');
      ensureVoiceListening();
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
        try { sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(Date.now())); } catch { }
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
        const { error: authError } = await supabase.auth.verifyOtp({ email: res.user.email, token: res.session_tokens.email_otp, type: 'magiclink' });
        if (authError) throw authError;
        try { sessionStorage.setItem('centralhub:shruthi-security-unlocked-at', String(Date.now())); } catch { }
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
    <main className="relative min-h-[100dvh] overflow-y-auto bg-[#01040a] px-5 py-[max(26px,env(safe-area-inset-top))] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(20,119,255,.22),transparent_30%),radial-gradient(circle_at_50%_82%,rgba(31,91,180,.12),transparent_34%)]" />
      <section className="relative mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-2xl flex-col items-center justify-center text-center">
        <div className="mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.30em] text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" /> CentralHub Secure Access</div>

        <div className="relative h-44 w-44 sm:h-52 sm:w-52">
          <div className="absolute inset-0 animate-pulse rounded-full border border-cyan-300/20 shadow-[0_0_80px_rgba(45,167,255,.22)]" />
          <div className="absolute inset-3 rounded-full border border-blue-400/30" />
          <img src="/shruthi-avatar.png" alt="Shruthi" className="absolute inset-5 h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)] rounded-full object-cover object-top shadow-2xl" />
        </div>

        <h1 className="mt-6 text-4xl font-light tracking-[0.08em] sm:text-5xl">SHRUTHI</h1>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-300">Security · Identity · Access</p>

        <div className="mt-7 w-full rounded-3xl border border-cyan-300/15 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-center gap-2 text-cyan-100"><Mic className="h-5 w-5" /><span className="font-semibold">{status}</span></div>
          <p className="mt-3 text-sm text-slate-400">Say naturally:</p>
          <p className="mt-1 text-lg font-medium">“Hi Shruthi, this is Tinu.”</p>
          <p className="mt-1 text-xs text-slate-500">Shruthi stays silent while listening so her own speaker does not interfere.</p>
          {heard && <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">Heard: {heard}</p>}
          <p className="mx-auto mt-4 max-w-lg text-[11px] leading-relaxed text-slate-500">Background speech without your security markers is ignored. For returning sessions, Android biometric/device credential confirms identity before CentralHub opens.</p>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void completeReturningUserUnlock()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100"><Fingerprint className="h-4 w-4" /> Verify this device</button>
            <button type="button" onClick={() => setFallbackVisible((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-200"><KeyRound className="h-4 w-4" /> Login ID & password</button>
          </div>

          <button type="button" onClick={() => {
            setStaffLoginSelected(true);
            setFallbackVisible(true);
            setMode('password');
            setError('');
            setStatus('Staff login · enter your work email and temporary or personal password');
          }} className="mt-3 w-full rounded-xl border border-cyan-400/40 bg-cyan-950/40 px-4 py-3 text-sm font-semibold text-cyan-100">
            <KeyRound className="mr-2 inline h-4 w-4" /> Staff login
          </button>
          {staffLoginSelected&&<p className="mt-2 text-xs text-slate-300">Staff accounts use their own email and password. Your Super Admin must activate the account before you can access assigned work sections.</p>}

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

        <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-600"><LockKeyhole className="h-3.5 w-3.5" /> Shruthi remains the access gate whenever CentralHub starts</div>
      </section>
    </main>
  );
}
