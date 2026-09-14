'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, BrainCircuit, CheckCircle2, Clock3, ExternalLink, Globe2, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type LearningState = {
  enabled: boolean;
  cadence_hours: number;
  mode: string;
  current_track: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  latest_summary: string | null;
  total_runs: number;
  total_insights: number;
  last_error: string | null;
};

type Insight = {
  id: string;
  track: string;
  title: string;
  summary: string;
  why_it_matters: string | null;
  recommended_action: string | null;
  confidence: number;
  impact: string;
  source_urls: string[];
  source_domains: string[];
  tags: string[];
  status: string;
  learned_at: string;
};

type Run = {
  id: string;
  track: string;
  source: string;
  status: string;
  summary: string | null;
  findings_count: number;
  sources_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

const tracks = [
  { key: 'seo_discovery', label: 'SEO & Discovery', detail: 'Search, structured data, AI discovery, local visibility' },
  { key: 'growth_merchandising', label: 'Growth & Merchandising', detail: 'Conversion, retention, pricing, checkout, customer experience' },
  { key: 'ai_technology', label: 'AI & Technology', detail: 'AI, automation, analytics, web, mobile and platform capabilities' },
  { key: 'market_operations', label: 'Market & Operations', detail: 'UK ecommerce, grocery, fulfilment and operational change' },
];

function ago(value: string | null) {
  if (!value) return 'Not yet';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function when(value: string | null) {
  if (!value) return 'Pending';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function trackLabel(key: string | null) {
  return tracks.find((track) => track.key === key)?.label || key?.replace(/_/g, ' ') || 'Research';
}

export default function ShruthiLearningPage() {
  const [state, setState] = useState<LearningState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [stateRes, insightRes, runRes] = await Promise.all([
      supabase.from('shruthi_learning_state').select('*').eq('id', 'primary').maybeSingle(),
      supabase.from('shruthi_learning_insights').select('*').neq('status', 'dismissed').order('learned_at', { ascending: false }).limit(60),
      supabase.from('shruthi_learning_runs').select('*').order('started_at', { ascending: false }).limit(20),
    ]);
    if (stateRes.data) setState(stateRes.data as LearningState);
    setInsights((insightRes.data || []) as Insight[]);
    setRuns((runRes.data || []) as Run[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel('shruthi-learning-console')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shruthi_learning_state' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shruthi_learning_insights' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shruthi_learning_runs' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const learnNow = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setMessage('');
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('Your session has expired.');
      const response = await fetch('/api/shruthi-learning/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(selectedTrack ? { track: selectedTrack } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload?.success) throw new Error(payload?.error || 'Learning run failed.');
      setMessage(payload?.summary || `Learning cycle completed: ${trackLabel(payload?.track || selectedTrack)}`);
      await refresh();
    } catch (error: any) {
      setMessage(error?.message || 'Learning run failed.');
    } finally {
      setRunning(false);
    }
  }, [refresh, running, selectedTrack]);

  const updateState = useCallback(async (patch: Partial<LearningState>) => {
    await supabase.from('shruthi_learning_state').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 'primary');
    await refresh();
  }, [refresh]);

  const recentHighImpact = useMemo(() => insights.filter((item) => item.impact === 'high' || item.impact === 'critical').length, [insights]);
  const sourceCount = useMemo(() => new Set(insights.flatMap((item) => item.source_domains || [])).size, [insights]);

  if (loading) return <div className="min-h-[70vh] grid place-items-center bg-[#030711] text-slate-300"><RefreshCw className="h-6 w-6 animate-spin text-cyan-300" /></div>;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,.10),transparent_28%),radial-gradient(circle_at_85%_8%,rgba(99,102,241,.12),transparent_30%),#030711] text-slate-100 px-3 py-4 sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] border border-cyan-400/15 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10">
                <BrainCircuit className="h-7 w-7 text-cyan-200" />
                <span className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-slate-950 ${state?.enabled ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.9)]' : 'bg-slate-500'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Shruthi Learning Core</h1>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-300">{state?.enabled ? 'Continuous learning active' : 'Paused'}</span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Continuous business research tailored to CentralHub. Shruthi researches current SEO, growth, ecommerce, AI and operational developments, filters weak information, and keeps sourced insights separate from live business truth.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-slate-900/80 px-3 text-sm text-slate-200 outline-none focus:border-cyan-400/50">
                <option value="">Next scheduled track</option>
                {tracks.map((track) => <option key={track.key} value={track.key}>{track.label}</option>)}
              </select>
              <button type="button" onClick={() => void learnNow()} disabled={running} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? 'Researching…' : 'Learn now'}
              </button>
              <button type="button" onClick={() => void updateState({ enabled: !state?.enabled, mode: state?.enabled ? 'paused' : 'continuous_research' })} className="min-h-11 rounded-xl border border-white/10 bg-white/[.04] px-4 text-sm font-medium text-slate-200 hover:bg-white/[.08]">{state?.enabled ? 'Pause' : 'Resume'}</button>
            </div>
          </div>
          {message && <div className="relative mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[.06] px-4 py-3 text-sm text-cyan-100">{message}</div>}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { icon: Clock3, label: 'Last learning', value: ago(state?.last_run_at || null), sub: `Next ${when(state?.next_run_at || null)}` },
            { icon: BookOpen, label: 'Knowledge signals', value: String(state?.total_insights || insights.length), sub: `${recentHighImpact} high impact` },
            { icon: Globe2, label: 'Source domains', value: String(sourceCount), sub: 'Sourced public research' },
            { icon: Zap, label: 'Cadence', value: `${state?.cadence_hours || 6}h`, sub: `${state?.total_runs || 0} research cycles` },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-white/[.07] bg-slate-950/60 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[.14em] text-slate-500"><Icon className="h-4 w-4 text-cyan-300" />{label}</div>
              <div className="mt-3 text-xl font-semibold text-white sm:text-2xl">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.6fr_.85fr]">
          <div className="rounded-[24px] border border-white/[.07] bg-slate-950/60 p-4 backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="font-semibold text-white">Latest discoveries</h2><p className="mt-1 text-xs text-slate-500">New knowledge is advisory until verified against live CentralHub data.</p></div>
              <span className="rounded-full border border-white/[.08] px-2.5 py-1 text-[10px] uppercase tracking-widest text-slate-400">Live feed</span>
            </div>
            <div className="space-y-3">
              {insights.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No discoveries yet. Tap <strong className="text-slate-300">Learn now</strong> to start the first research cycle.</div>}
              {insights.slice(0, 18).map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-400/20 hover:bg-cyan-400/[.025]">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[.14em]">
                    <span className="text-cyan-300">{trackLabel(item.track)}</span>
                    <span className={`rounded-full px-2 py-0.5 ${item.impact === 'critical' ? 'bg-rose-400/10 text-rose-300' : item.impact === 'high' ? 'bg-amber-400/10 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{item.impact}</span>
                    <span className="text-slate-600">{Math.round(Number(item.confidence || 0) * 100)}% confidence</span>
                    <span className="ml-auto text-slate-600">{ago(item.learned_at)}</span>
                  </div>
                  <h3 className="mt-2.5 text-[15px] font-semibold leading-6 text-slate-100">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.summary}</p>
                  {item.why_it_matters && <div className="mt-3 rounded-xl border border-indigo-400/10 bg-indigo-400/[.04] px-3 py-2.5 text-xs leading-5 text-slate-300"><span className="font-semibold text-indigo-300">Why it matters · </span>{item.why_it_matters}</div>}
                  {item.recommended_action && <div className="mt-2 flex gap-2 text-xs leading-5 text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span><strong className="text-emerald-300">Suggested next step:</strong> {item.recommended_action}</span></div>}
                  {!!item.source_urls?.length && <div className="mt-3 flex flex-wrap gap-2">{item.source_urls.slice(0, 4).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-white/[.08] bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200"><ExternalLink className="h-3 w-3" /><span className="max-w-[190px] truncate">{(() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'source'; } })()}</span></a>)}</div>}
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/[.07] bg-slate-950/60 p-4 backdrop-blur-xl sm:p-5">
              <h2 className="font-semibold text-white">Learning programme</h2>
              <div className="mt-4 space-y-2.5">{tracks.map((track) => <div key={track.key} className={`rounded-xl border p-3 ${state?.current_track === track.key ? 'border-cyan-400/25 bg-cyan-400/[.06]' : 'border-white/[.06] bg-white/[.02]'}`}><div className="flex items-center gap-2 text-sm font-medium text-slate-200">{state?.current_track === track.key && <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.8)]" />}{track.label}</div><p className="mt-1 text-[11px] leading-5 text-slate-500">{track.detail}</p></div>)}</div>
            </section>

            <section className="rounded-[24px] border border-white/[.07] bg-slate-950/60 p-4 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Learning log</h2><Link href="/business-intelligence/executive" className="text-xs text-cyan-300 hover:text-cyan-200">Business BI →</Link></div>
              <div className="mt-4 space-y-3">{runs.slice(0, 8).map((run) => <div key={run.id} className="border-l border-white/10 pl-3"><div className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${run.status === 'completed' ? 'bg-emerald-400' : run.status === 'failed' ? 'bg-rose-400' : 'bg-cyan-300 animate-pulse'}`} /><span className="font-medium text-slate-300">{trackLabel(run.track)}</span><span className="ml-auto text-slate-600">{ago(run.started_at)}</span></div><p className="mt-1 text-[11px] leading-5 text-slate-500">{run.status === 'failed' ? run.error : `${run.findings_count || 0} findings · ${run.sources_count || 0} sources`}</p></div>)}</div>
              {state?.last_error && <div className="mt-4 rounded-xl border border-rose-400/15 bg-rose-400/[.06] p-3 text-xs leading-5 text-rose-200">{state.last_error}</div>}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
