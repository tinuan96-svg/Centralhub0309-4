'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MonitorUp, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type VoiceCommand = {
  id: string;
  input_text: string | null;
  action_name: string | null;
  action_payload: Record<string, unknown> | null;
  risk_level: string | null;
  status: string | null;
  created_at: string;
};

type NativeComputerBridge = {
  getPlatform?: () => string;
  openNoraComputerMode?: (sessionId: string, targetUrl: string, accessToken: string, supabaseUrl: string) => boolean;
  speakTara?: (text: string, languageTag: string) => boolean;
  stopTaraTts?: () => void;
};

type Target = { key: string; system: string; url: string };

const TARGETS: Target[] = [
  { key: 'meta_business', system: 'Meta Business', url: 'https://business.facebook.com/' },
  { key: 'facebook', system: 'Facebook', url: 'https://www.facebook.com/' },
  { key: 'google_ads', system: 'Google Ads', url: 'https://ads.google.com/' },
  { key: 'google_merchant', system: 'Google Merchant Center', url: 'https://merchants.google.com/' },
  { key: 'google_analytics', system: 'Google Analytics', url: 'https://analytics.google.com/' },
  { key: 'google_search_console', system: 'Google Search Console', url: 'https://search.google.com/search-console/' },
  { key: 'google_business', system: 'Google Business Profile', url: 'https://business.google.com/' },
  { key: 'google_account', system: 'Google Account', url: 'https://accounts.google.com/' },
  { key: 'github', system: 'GitHub', url: 'https://github.com/' },
  { key: 'netlify', system: 'Netlify', url: 'https://app.netlify.com/' },
  { key: 'supabase', system: 'Supabase', url: 'https://supabase.com/dashboard/' },
];

function bridge(): NativeComputerBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeComputerBridge }).CentralHubNative;
}

function targetByKey(key: unknown): Target | null {
  const normalized = String(key || '').trim().toLowerCase();
  return TARGETS.find((item) => item.key === normalized) || null;
}

function targetFor(text: string): Target | null {
  const value = text.toLowerCase();
  if (/\b(merchant center|google merchant|merchant account)\b/.test(value)) return targetByKey('google_merchant');
  if (/\b(google ads|google advertising|adwords|ads account)\b/.test(value)) return targetByKey('google_ads');
  if (/\b(google analytics|ga4|analytics account)\b/.test(value)) return targetByKey('google_analytics');
  if (/\b(search console|google search console)\b/.test(value)) return targetByKey('google_search_console');
  if (/\b(google business profile|google business|business profile)\b/.test(value)) return targetByKey('google_business');
  if (/\b(google account|gmail account)\b/.test(value)) return targetByKey('google_account');
  if (/\b(meta business|business manager|business suite|meta ads|facebook ads|ads manager|instagram business)\b/.test(value)) return targetByKey('meta_business');
  if (/\b(facebook account|facebook page|facebook)\b/.test(value)) return targetByKey('facebook');
  if (/\bgithub\b/.test(value)) return targetByKey('github');
  if (/\bnetlify\b/.test(value)) return targetByKey('netlify');
  if (/\bsupabase\b/.test(value)) return targetByKey('supabase');
  return null;
}

function targetFromCommand(command: VoiceCommand | null): Target | null {
  if (!command) return null;
  const payload = command.action_payload || {};
  const byKey = targetByKey(payload.computer_target_key);
  if (byKey) return byKey;

  const payloadUrl = typeof payload.computer_target_url === 'string' ? payload.computer_target_url.trim() : '';
  const payloadSystem = typeof payload.computer_target_system === 'string' ? payload.computer_target_system.trim() : '';
  if (payloadUrl) {
    try {
      const url = new URL(payloadUrl);
      if (url.protocol === 'https:') {
        const known = TARGETS.find((item) => new URL(item.url).hostname === url.hostname);
        if (known) return { ...known, url: payloadUrl, system: payloadSystem || known.system };
      }
    } catch {
      // Ignore invalid backend URLs and fall back to deterministic task matching.
    }
  }
  return targetFor(`${command.input_text || ''} ${command.action_name || ''}`);
}

function announceHandoff(target: Target) {
  const native = bridge();
  if (native?.getPlatform?.() !== 'android') return;
  try {
    native.stopTaraTts?.();
    native.speakTara?.(
      `I’m opening ${target.system} and starting this task now. I’ll pause if I need login, verification, missing details, or your approval for a consequential final step.`,
      'en-GB',
    );
  } catch {
    // The visible browser still launches even if speech is unavailable.
  }
}

export default function NoraComputerLauncher() {
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState('');
  const autoStartedRef = useRef<string | null>(null);

  const target = useMemo(() => targetFromCommand(command), [command]);
  const autoStart = Boolean(command?.action_payload?.computer_auto_start);

  const refresh = useCallback(async () => {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setCommand(null);

    const { data: active } = await supabase
      .from('nora_action_sessions')
      .select('id')
      .eq('user_id', auth.user.id)
      .in('status', ['planned', 'running', 'waiting_input', 'waiting_approval', 'paused'])
      .limit(1);
    if (active?.length) return setCommand(null);

    const { data } = await supabase
      .from('voice_assistant_commands')
      .select('id,input_text,action_name,action_payload,risk_level,status,created_at')
      .eq('user_id', auth.user.id)
      .in('status', ['ready_for_computer', 'pending_confirmation'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(12);

    const candidate = (data || []).find((row) => targetFromCommand(row as VoiceCommand));
    setCommand((candidate || null) as VoiceCommand | null);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`nora-computer-launcher-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_assistant_commands' }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voice_assistant_commands' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nora_action_sessions' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const start = useCallback(async () => {
    if (!command || !target || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authSession = sessionData.session;
      if (!authSession?.user || !authSession.access_token) throw new Error('Your CentralHub session has expired.');

      const native = bridge();
      if (native?.getPlatform?.() !== 'android' || !native.openNoraComputerMode) {
        throw new Error('Shruthi Live Action currently requires the CentralHub Android app.');
      }

      const goal = String(command.action_payload?.computer_goal || command.input_text || command.action_name || `Work in ${target.system}`);
      const { data: actionSession, error: insertError } = await supabase
        .from('nora_action_sessions')
        .insert({
          user_id: authSession.user.id,
          title: `Shruthi · ${target.system}`,
          goal,
          target_system: target.system,
          target_url: target.url,
          status: 'planned',
          risk_level: command.risk_level === 'high' ? 'high' : 'medium',
          current_step: `Opening ${target.system}`,
          metadata: {
            source: 'voice_assistant',
            source_voice_command_id: command.id,
            target_key: target.key,
            auto_started: autoStart,
          },
        })
        .select('id')
        .single();
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create Shruthi action session.');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      announceHandoff(target);
      const launched = native.openNoraComputerMode(actionSession.id, target.url, authSession.access_token, supabaseUrl) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({ status: 'failed', last_error: 'Android Computer Mode could not launch.', completed_at: new Date().toISOString() }).eq('id', actionSession.id);
        throw new Error('Android Computer Mode could not launch. Update the CentralHub app first.');
      }

      await supabase.from('voice_assistant_commands').update({
        status: 'completed',
        action_payload: {
          ...(command.action_payload || {}),
          computer_session_id: actionSession.id,
          delegated_to: 'nora_computer_mode',
          resolved_target_key: target.key,
          resolved_target_url: target.url,
        },
      }).eq('id', command.id);
      setCommand(null);
    } catch (e: any) {
      autoStartedRef.current = null;
      setError(e?.message || 'Could not start Shruthi Live Action.');
    } finally {
      setBusy(false);
    }
  }, [autoStart, busy, command, target]);

  useEffect(() => {
    if (!command || !target || !autoStart || busy || dismissed === command.id) return;
    if (autoStartedRef.current === command.id) return;
    autoStartedRef.current = command.id;
    const timer = window.setTimeout(() => void start(), 350);
    return () => window.clearTimeout(timer);
  }, [autoStart, busy, command, dismissed, start, target]);

  if (!command || !target || dismissed === command.id) return null;
  if (autoStart && !error) return null;

  return (
    <section className="fixed bottom-[calc(9.4rem+env(safe-area-inset-bottom))] right-3 z-[110] w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-cyan-400/25 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:bottom-24 sm:right-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10"><MonitorUp className="h-5 w-5 text-cyan-300" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Shruthi Live Action</h3><button type="button" onClick={() => setDismissed(command.id)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Dismiss"><X className="h-4 w-4" /></button></div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Shruthi resolved this task to <strong className="text-slate-200">{target.system}</strong>. She will work visibly and pause for login, OTP, CAPTCHA, missing business details or consequential approval.</p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />No task defaults to Facebook. The requested system is resolved per instruction.</div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void start()} className="mt-3 w-full rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Starting…' : `Open ${target.system} & continue`}</button>
        </div>
      </div>
    </section>
  );
}
