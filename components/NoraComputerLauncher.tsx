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
};

type Target = { key: string; system: string; url: string };

const TARGETS: Target[] = [
  { key: 'meta_business', system: 'Meta Business', url: 'https://business.facebook.com/' },
  { key: 'facebook', system: 'Facebook', url: 'https://www.facebook.com/' },
  { key: 'instagram', system: 'Instagram', url: 'https://www.instagram.com/' },
  { key: 'spotify', system: 'Spotify', url: 'https://www.spotify.com/' },
  { key: 'shopify', system: 'Shopify', url: 'https://admin.shopify.com/' },
  { key: 'web_search', system: 'Web Search', url: 'https://www.google.com/' },
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
  if (/\b(instagram account|instagram profile|instagram signup|instagram sign up|create instagram|open instagram)\b/.test(value)) return targetByKey('instagram');
  if (/\b(meta business|business manager|business suite|meta ads|facebook ads|ads manager|instagram business|connect instagram)\b/.test(value)) return targetByKey('meta_business');
  if (/\b(facebook account|facebook page|facebook)\b/.test(value)) return targetByKey('facebook');
  if (/\bspotify\b/.test(value)) return targetByKey('spotify');
  if (/\bshopify\b/.test(value)) return targetByKey('shopify');
  if (/\bgithub\b/.test(value)) return targetByKey('github');
  if (/\bnetlify\b/.test(value)) return targetByKey('netlify');
  if (/\bsupabase\b/.test(value)) return targetByKey('supabase');
  if (/\b(search|search the web|search web|look up|lookup|research|browse|find online|check online|scan website|visit website|check website|latest news|latest information|external source|from the web|on the web)\b/.test(value)) return targetByKey('web_search');
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
        return {
          key: String(payload.computer_target_key || 'external_web').trim().toLowerCase() || 'external_web',
          system: payloadSystem || url.hostname,
          url: payloadUrl,
        };
      }
    } catch {
      // Ignore malformed backend URLs and fall back to deterministic matching.
    }
  }
  return targetFor(`${command.input_text || ''} ${command.action_name || ''}`);
}

function securityUnlockCutoffMs() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = Number(sessionStorage.getItem('centralhub:shruthi-security-unlocked-at') || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

export default function NoraComputerLauncher() {
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState('');
  const autoStartedRef = useRef<string | null>(null);
  const launchingRef = useRef(false);

  const target = useMemo(() => targetFromCommand(command), [command]);
  const autoStart = Boolean(command?.action_payload?.computer_auto_start);

  const refresh = useCallback(async () => {
    if (typeof window !== 'undefined' && (window as any).__centralHubSecurityLocked === true) {
      setCommand(null);
      return;
    }

    const now = Date.now();
    const unlockCutoff = securityUnlockCutoffMs();
    const commandCutoffMs = Math.max(now - 2 * 60 * 60 * 1000, unlockCutoff);
    const commandCutoff = new Date(commandCutoffMs).toISOString();
    const activeCutoff = new Date(now - 15 * 60 * 1000).toISOString();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setCommand(null);

    const { data: active } = await supabase
      .from('nora_action_sessions')
      .select('id,updated_at')
      .eq('user_id', auth.user.id)
      .in('status', ['planned', 'running', 'waiting_input', 'waiting_approval'])
      .gte('updated_at', activeCutoff)
      .limit(1);
    if (active?.length) return setCommand(null);

    const { data } = await supabase
      .from('voice_assistant_commands')
      .select('id,input_text,action_name,action_payload,risk_level,status,created_at')
      .eq('user_id', auth.user.id)
      .in('status', ['ready_for_computer', 'pending_confirmation'])
      .gte('created_at', commandCutoff)
      .order('created_at', { ascending: false })
      .limit(20);

    const candidate = (data || []).find((row) => targetFromCommand(row as VoiceCommand));
    setCommand((candidate || null) as VoiceCommand | null);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`shruthi-computer-launcher-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_assistant_commands' }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voice_assistant_commands' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nora_action_sessions' }, () => void refresh())
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 2000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const start = useCallback(async () => {
    if (!command || !target || busy || launchingRef.current) return;
    const unlockCutoff = securityUnlockCutoffMs();
    if (unlockCutoff > 0 && new Date(command.created_at).getTime() < unlockCutoff) {
      setCommand(null);
      return;
    }

    launchingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authSession = sessionData.session;
      if (!authSession?.user || !authSession.access_token) throw new Error('Your CentralHub session has expired.');

      const native = bridge();
      if (native?.getPlatform?.() !== 'android' || !native.openNoraComputerMode) {
        throw new Error('Shruthi Live Web requires the current CentralHub Android app.');
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
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create Shruthi Live Web session.');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const launched = native.openNoraComputerMode(actionSession.id, target.url, authSession.access_token, supabaseUrl) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({
          status: 'failed',
          last_error: 'Android Live Web activity could not launch.',
          completed_at: new Date().toISOString(),
        }).eq('id', actionSession.id);
        throw new Error('Android Live Web could not launch. Update/reopen the CentralHub app.');
      }

      const { data: completed, error: completeError } = await supabase.rpc('complete_voice_computer_command', {
        p_command_id: command.id,
        p_session_id: actionSession.id,
        p_target_key: target.key,
        p_target_url: target.url,
      });
      if (completeError || completed !== true) {
        console.warn('Live Web launched but source command completion could not be persisted', completeError);
      }
      setCommand(null);
    } catch (e: any) {
      autoStartedRef.current = null;
      setError(e?.message || 'Could not start Shruthi Live Web.');
    } finally {
      launchingRef.current = false;
      setBusy(false);
    }
  }, [autoStart, busy, command, target]);

  useEffect(() => {
    if (!command || !target || !autoStart || busy || dismissed === command.id) return;
    if (autoStartedRef.current === command.id) return;
    autoStartedRef.current = command.id;
    const timer = window.setTimeout(() => void start(), 220);
    return () => window.clearTimeout(timer);
  }, [autoStart, busy, command, dismissed, start, target]);

  if (!command || !target || dismissed === command.id) return null;
  if (autoStart && !error) return null;

  return (
    <section className="fixed bottom-[calc(9.4rem+env(safe-area-inset-bottom))] right-3 z-[110] w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-cyan-400/25 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:bottom-24 sm:right-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10"><MonitorUp className="h-5 w-5 text-cyan-300" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Shruthi Live Web</h3><button type="button" onClick={() => setDismissed(command.id)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Dismiss"><X className="h-4 w-4" /></button></div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Resolved to <strong className="text-slate-200">{target.system}</strong>. Shruthi will work visibly and pause for authentication, missing details, or consequential approval.</p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Only fresh tasks created after the current security unlock can auto-open Live Web.</div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void start()} className="mt-3 w-full rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Starting…' : `Open ${target.system} & continue`}</button>
        </div>
      </div>
    </section>
  );
}