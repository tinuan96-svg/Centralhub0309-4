'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CirclePause, CirclePlay, Globe2, Hand, MessageCircleQuestion, MousePointer2, ShieldAlert, Square, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ActionSession = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  target_system: string | null;
  target_url: string | null;
  status: 'planned' | 'running' | 'waiting_input' | 'waiting_approval' | 'paused' | 'completed' | 'failed' | 'cancelled';
  risk_level: 'read_only' | 'low' | 'medium' | 'high' | 'critical';
  current_step: string | null;
  awaiting_input: boolean;
  requires_approval: boolean;
  approval_reason: string | null;
  screenshot_url: string | null;
  last_error: string | null;
  completed_at: string | null;
  updated_at: string;
};

type ActionStep = {
  id: string;
  sequence_no: number;
  action_type: string;
  description: string;
  status: string;
  requires_approval: boolean;
  screenshot_url: string | null;
  created_at: string;
};

type ActionQuestion = {
  id: string;
  question: string;
  answer: string | null;
  status: 'pending' | 'answered' | 'dismissed';
  is_sensitive: boolean;
  created_at: string;
};

const ACTIVE_STATUSES = ['planned', 'running', 'waiting_input', 'waiting_approval', 'paused'];

function statusText(status: ActionSession['status']) {
  switch (status) {
    case 'running': return 'Working now';
    case 'waiting_input': return 'Waiting for your answer';
    case 'waiting_approval': return 'Approval required';
    case 'paused': return 'Paused';
    case 'planned': return 'Preparing';
    case 'completed': return 'Completed';
    case 'failed': return 'Needs attention';
    case 'cancelled': return 'Cancelled';
  }
}

export default function NoraLiveActionOverlay() {
  const [session, setSession] = useState<ActionSession | null>(null);
  const [steps, setSteps] = useState<ActionStep[]>([]);
  const [questions, setQuestions] = useState<ActionQuestion[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const pendingQuestion = useMemo(() => questions.find((item) => item.status === 'pending') || null, [questions]);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSession(null);
      return;
    }

    const { data: sessions } = await supabase
      .from('nora_action_sessions')
      .select('*')
      .eq('user_id', auth.user.id)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(1);

    const active = (sessions?.[0] || null) as ActionSession | null;
    setSession(active);
    if (!active) {
      setSteps([]);
      setQuestions([]);
      return;
    }

    const [{ data: stepRows }, { data: questionRows }] = await Promise.all([
      supabase.from('nora_action_steps').select('*').eq('session_id', active.id).order('sequence_no', { ascending: true }).limit(80),
      supabase.from('nora_action_questions').select('*').eq('session_id', active.id).order('created_at', { ascending: true }).limit(40),
    ]);
    setSteps((stepRows || []) as ActionStep[]);
    setQuestions((questionRows || []) as ActionQuestion[]);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`nora-live-actions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nora_action_sessions' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nora_action_steps' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nora_action_questions' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const updateSession = useCallback(async (patch: Partial<ActionSession>) => {
    if (!session) return;
    setBusy(true);
    try {
      await supabase.from('nora_action_sessions').update(patch).eq('id', session.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, session]);

  const submitAnswer = useCallback(async () => {
    if (!pendingQuestion || !session || !answer.trim()) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('nora_action_questions').update({ answer: answer.trim(), status: 'answered', answered_at: now }).eq('id', pendingQuestion.id);
      await supabase.from('nora_action_sessions').update({ status: 'running', awaiting_input: false, current_step: 'Continuing with your answer' }).eq('id', session.id);
      setAnswer('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [answer, pendingQuestion, refresh, session]);

  if (!session) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-4 bottom-24 z-[95] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-cyan-400/30 bg-slate-950/95 px-4 py-3 text-left text-white shadow-2xl backdrop-blur-xl"
      >
        <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" /><span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-300" /></span>
        <span className="min-w-0"><span className="block text-xs font-semibold tracking-[0.16em] text-cyan-300">Shruthi LIVE ACTION</span><span className="block max-w-[260px] truncate text-sm text-slate-200">{session.current_step || session.title}</span></span>
      </button>
    );
  }

  const screenshot = steps.slice().reverse().find((item) => item.screenshot_url)?.screenshot_url || session.screenshot_url;
  const latestSteps = steps.slice(-7).reverse();

  return (
    <section className="fixed inset-x-3 bottom-20 z-[95] mx-auto max-w-5xl overflow-hidden rounded-3xl border border-cyan-400/25 bg-[#030812]/95 text-white shadow-2xl backdrop-blur-2xl md:inset-x-auto md:right-5 md:bottom-5 md:w-[760px]" aria-live="polite">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10"><MousePointer2 className="h-5 w-5 text-cyan-300" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Shruthi · Live Action</h2><span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">{statusText(session.status)}</span></div>
          <p className="truncate text-xs text-slate-400">{session.title} · {session.target_system || 'External task'}</p>
        </div>
        <button type="button" onClick={() => setCollapsed(true)} className="rounded-xl p-2 text-slate-300 hover:bg-white/10" aria-label="Collapse Shruthi live action"><X className="h-5 w-5" /></button>
      </header>

      <div className="grid gap-0 md:grid-cols-[1.35fr_.9fr]">
        <div className="min-w-0 border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300">
            <Globe2 className="h-4 w-4 shrink-0 text-cyan-300" /><span className="truncate">{session.target_url || session.target_system || 'Secure browser session'}</span>
          </div>

          <div className="relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/60">
            {screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshot} alt="Latest Shruthi browser action" className="max-h-[320px] w-full object-contain" />
            ) : (
              <div className="px-8 py-10 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10"><Hand className="h-7 w-7 text-cyan-300" /></div><p className="font-medium text-slate-200">Shruthi is preparing the browser view</p><p className="mt-2 text-sm text-slate-500">Screenshots from the computer-use runtime will appear here while she clicks, types and selects.</p></div>
            )}
            {session.current_step && <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-slate-200 backdrop-blur"><span className="mr-2 text-cyan-300">Now</span>{session.current_step}</div>}
          </div>

          {pendingQuestion && (
            <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100"><MessageCircleQuestion className="h-4 w-4" />Shruthi needs your input</div>
              <p className="text-sm text-slate-200">{pendingQuestion.question}</p>
              <div className="mt-3 flex gap-2"><input type={pendingQuestion.is_sensitive ? 'password' : 'text'} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submitAnswer(); }} placeholder="Answer Shruthi…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-base outline-none focus:border-cyan-400/50" /><button type="button" disabled={busy || !answer.trim()} onClick={() => void submitAnswer()} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Continue</button></div>
            </div>
          )}

          {session.requires_approval && (
            <div className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-rose-100"><ShieldAlert className="h-4 w-4" />Approval required</div>
              <p className="text-sm text-slate-200">{session.approval_reason || 'This step can create an external or difficult-to-reverse change.'}</p>
              <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void updateSession({ requires_approval: false, status: 'running', current_step: 'Approved — continuing safely' })} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"><Check className="h-4 w-4" />Approve</button><button type="button" disabled={busy} onClick={() => void updateSession({ status: 'paused', current_step: 'Approval declined — waiting' })} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200">Not now</button></div>
            </div>
          )}
        </div>

        <aside className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Action trail</p><p className="text-xs text-slate-500">Every step is recorded</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-slate-400">{session.risk_level} risk</span></div>
          <div className="space-y-2">
            {latestSteps.length ? latestSteps.map((step) => <div key={step.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${step.status === 'completed' ? 'bg-emerald-400' : step.status === 'failed' ? 'bg-rose-400' : step.status.startsWith('waiting') ? 'bg-amber-300' : 'bg-cyan-300'}`} /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{step.action_type}</p><p className="mt-0.5 text-sm text-slate-200">{step.description}</p></div></div></div>) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No browser steps recorded yet.</p>}
          </div>

          {session.last_error && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-100">{session.last_error}</p>}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
            {session.status === 'paused' ? <button type="button" disabled={busy} onClick={() => void updateSession({ status: 'running', current_step: 'Resuming task' })} className="flex items-center gap-2 rounded-xl border border-cyan-400/25 px-3 py-2 text-xs text-cyan-200"><CirclePlay className="h-4 w-4" />Resume</button> : <button type="button" disabled={busy || session.status === 'waiting_approval'} onClick={() => void updateSession({ status: 'paused', current_step: 'Paused by admin' })} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"><CirclePause className="h-4 w-4" />Pause</button>}
            <button type="button" disabled={busy} onClick={() => void updateSession({ status: 'cancelled', completed_at: new Date().toISOString(), current_step: 'Cancelled by admin' })} className="flex items-center gap-2 rounded-xl border border-rose-400/20 px-3 py-2 text-xs text-rose-200"><Square className="h-3.5 w-3.5" />End task</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
