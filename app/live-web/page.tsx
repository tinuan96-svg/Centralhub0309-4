'use client';

import { useMemo, useState } from 'react';
import { Bot, Globe2, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NativeBrowserBridge = {
  getPlatform?: () => string;
  openNoraComputerMode?: (sessionId: string, targetUrl: string, accessToken: string, supabaseUrl: string) => boolean;
};

const QUICK_LINKS = [
  ['Meta Business', 'https://business.facebook.com/'],
  ['Google Ads', 'https://ads.google.com/'],
  ['Merchant Center', 'https://merchants.google.com/'],
  ['Google Analytics', 'https://analytics.google.com/'],
  ['Search Console', 'https://search.google.com/search-console/'],
  ['GitHub', 'https://github.com/'],
  ['Netlify', 'https://app.netlify.com/'],
  ['Supabase', 'https://supabase.com/dashboard/'],
  ['Kerala Taste', 'https://keralataste.com/'],
  ['PickEasy', 'https://pickeasy.co.uk/'],
  ['Veenas', 'https://veenas.com/'],
  ['The Indian Shelf', 'https://theindianshelf.co.uk/'],
] as const;

function nativeBridge(): NativeBrowserBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBrowserBridge }).CentralHubNative;
}

function normalizeTarget(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Enter a website or search term.');
  if (/\s/.test(value) || (!value.includes('.') && !/^https:\/\//i.test(value))) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
  const normalized = /^https:\/\//i.test(value) ? value : `https://${value.replace(/^http:\/\//i, '')}`;
  const url = new URL(normalized);
  if (url.protocol !== 'https:') throw new Error('Live Web only opens HTTPS websites.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) {
    throw new Error('Local/private network addresses are blocked in Live Web.');
  }
  return url.toString();
}

export default function LiveWebPage() {
  const [address, setAddress] = useState('https://www.google.com/');
  const [goal, setGoal] = useState('Inspect the starting page, summarize what matters for CentralHub, and wait for my approval before any consequential action.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAndroid = useMemo(() => {
    try { return nativeBridge()?.getPlatform?.() === 'android'; } catch { return false; }
  }, []);

  const launch = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const targetUrl = normalizeTarget(address);
      const bridge = nativeBridge();
      if (bridge?.getPlatform?.() !== 'android' || !bridge.openNoraComputerMode) throw new Error('Live Web requires the CentralHub Android app.');
      const { data } = await supabase.auth.getSession();
      const auth = data.session;
      if (!auth?.user || !auth.access_token) throw new Error('Your CentralHub session has expired. Sign in again.');
      const hostname = new URL(targetUrl).hostname;
      const { data: actionSession, error: insertError } = await supabase
        .from('nora_action_sessions')
        .insert({
          user_id: auth.user.id,
          title: `Live Web · ${hostname}`,
          goal: goal.trim() || `Inspect ${hostname} and help the admin with the visible page.`,
          target_system: hostname,
          target_url: targetUrl,
          status: 'planned',
          risk_level: 'medium',
          current_step: `Opening ${hostname}`,
          metadata: { source: 'centralhub_live_web', browser_mode: true },
        })
        .select('id')
        .single();
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create the Live Web session.');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const launched = bridge.openNoraComputerMode(actionSession.id, targetUrl, auth.access_token, supabaseUrl) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({ status: 'failed', last_error: 'Android Live Web could not launch.', completed_at: new Date().toISOString() }).eq('id', actionSession.id);
        throw new Error('Could not open Live Web. Install the latest CentralHub Android update.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not open Live Web.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-cyan-400/15 bg-slate-900/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300"><Globe2 /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">CentralHub Live Web</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">A separate secure browser for live websites and Shruthi computer actions. Third-party pages never receive the CentralHub native admin bridge.</p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4 md:p-5">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Website or search</label>
          <div className="mt-2 flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-700 bg-slate-950 px-3"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void launch(); }} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" placeholder="Website or search term" /></div>
            <button type="button" onClick={() => void launch()} disabled={busy} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open'}</button>
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What should Shruthi do?</label>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none" />
          {error && <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {!isAndroid && <p className="mt-3 text-xs text-amber-300">Open this page inside the CentralHub Android app to launch Live Web.</p>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(([name, url]) => (
            <button key={url} type="button" onClick={() => setAddress(url)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-cyan-400/30 hover:bg-slate-900">
              <div className="flex items-center gap-2 text-sm font-bold"><Globe2 className="h-4 w-4 text-cyan-300" />{name}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{new URL(url).hostname}</div>
            </button>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"><div className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck className="h-4 w-4" />Isolated browsing</div><p className="mt-2 text-xs leading-relaxed text-slate-400">Only public HTTPS pages are allowed. Local/private network addresses, file access and mixed HTTP content stay blocked.</p></div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4"><div className="flex items-center gap-2 font-bold text-violet-200"><Bot className="h-4 w-4" />Shruthi live inspection</div><p className="mt-2 text-xs leading-relaxed text-slate-400">Use Take over for manual browsing, Ask for page-specific questions, or Check for a fresh AI inspection. Passwords, OTPs and CAPTCHA remain manual.</p></div>
        </section>
      </div>
    </main>
  );
}
