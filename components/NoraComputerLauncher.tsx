'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonitorUp, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type VoiceCommand = {
  id: string;
  input_text: string | null;
  action_name: string | null;
  risk_level: string | null;
  status: string | null;
  created_at: string;
};

type NativeComputerBridge = {
  getPlatform?: () => string;
  openNoraComputerMode?: (sessionId: string, targetUrl: string, accessToken: string, supabaseUrl: string) => boolean;
};

type Target = { system: string; url: string };

function bridge(): NativeComputerBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeComputerBridge }).CentralHubNative;
}

function targetFor(text: string): Target | null {
  const value = text.toLowerCase();
  if (/\b(meta|facebook|instagram|business manager|business suite|ads manager)\b/.test(value)) {
    return { system: 'Meta / Facebook', url: 'https://business.facebook.com/' };
  }
  if (/\b(google ads|google advertising|adwords)\b/.test(value)) {
    return { system: 'Google Ads', url: 'https://ads.google.com/' };
  }
  return null;
}

export default function NoraComputerLauncher() {
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState('');

  const target = useMemo(() => targetFor(`${command?.input_text || ''} ${command?.action_name || ''}`), [command]);

  const refresh = useCallback(async () => {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
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
      .select('id,input_text,action_name,risk_level,status,created_at')
      .eq('user_id', auth.user.id)
      .eq('status', 'pending_confirmation')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(8);

    const candidate = (data || []).find((row) => targetFor(`${row.input_text || ''} ${row.action_name || ''}`));
    setCommand((candidate || null) as VoiceCommand | null);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`nora-computer-launcher-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_assistant_commands' }, () => void refresh())
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

      const platform = bridge()?.getPlatform?.();
      if (platform !== 'android' || !bridge()?.openNoraComputerMode) throw new Error('NORA Live Action currently requires the CentralHub Android app.');

      const { data: actionSession, error: insertError } = await supabase
        .from('nora_action_sessions')
        .insert({
          user_id: authSession.user.id,
          title: `NORA · ${target.system}`,
          goal: command.input_text || command.action_name || `Work in ${target.system}`,
          target_system: target.system,
          target_url: target.url,
          status: 'planned',
          risk_level: 'medium',
          current_step: 'Preparing secure visible browser',
          metadata: { source: 'voice_assistant', source_voice_command_id: command.id },
        })
        .select('id')
        .single();
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create NORA action session.');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const launched = bridge()?.openNoraComputerMode?.(actionSession.id, target.url, authSession.access_token, supabaseUrl) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({ status: 'failed', last_error: 'Android Computer Mode could not launch.', completed_at: new Date().toISOString() }).eq('id', actionSession.id);
        throw new Error('Android Computer Mode could not launch. Update the CentralHub app first.');
      }

      await supabase.from('voice_assistant_commands').update({ status: 'completed', action_payload: { computer_session_id: actionSession.id, delegated_to: 'nora_computer_mode' } }).eq('id', command.id);
      setCommand(null);
    } catch (e: any) {
      setError(e?.message || 'Could not start NORA Live Action.');
    } finally {
      setBusy(false);
    }
  }, [busy, command, target]);

  if (!command || !target || dismissed === command.id) return null;

  return (
    <section className="fixed bottom-[calc(9.4rem+env(safe-area-inset-bottom))] right-3 z-[110] w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-cyan-400/25 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:bottom-24 sm:right-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10"><MonitorUp className="h-5 w-5 text-cyan-300" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">NORA can do this on screen</h3><button type="button" onClick={() => setDismissed(command.id)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Dismiss"><X className="h-4 w-4" /></button></div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Open {target.system} in secure Live Action Mode and watch NORA click, select and fill ordinary fields. You take over for login, OTP or CAPTCHA.</p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Final account creation, spend and publishing still require approval.</div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void start()} className="mt-3 w-full rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Starting…' : 'Start NORA Live Action'}</button>
        </div>
      </div>
    </section>
  );
}
