'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type LearningState = {
  enabled: boolean;
  current_track: string | null;
  last_run_at: string | null;
  total_insights: number;
};

function label(track: string | null) {
  if (!track) return 'Learning';
  const labels: Record<string, string> = {
    seo_discovery: 'SEO & Discovery',
    growth_merchandising: 'Growth',
    ai_technology: 'AI & Technology',
    market_operations: 'Market & Operations',
  };
  return labels[track] || 'Learning';
}

export default function ShruthiLearningPulse() {
  const pathname = usePathname();
  const [state, setState] = useState<LearningState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('shruthi_learning_state')
        .select('enabled,current_track,last_run_at,total_insights')
        .eq('id', 'primary')
        .maybeSingle();
      if (alive && data) setState(data as LearningState);
    };
    void load();
    const channel = supabase.channel('shruthi-learning-pulse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shruthi_learning_state' }, () => void load())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, []);

  if (pathname !== '/dashboard' || !state) return null;

  return (
    <Link
      href="/shruthi-learning"
      aria-label="Open Shruthi Self Learning"
      className="fixed right-3 top-[4.7rem] z-[72] flex max-w-[min(78vw,290px)] items-center gap-2.5 rounded-2xl border border-cyan-300/20 bg-slate-950/88 px-3 py-2.5 text-white shadow-xl shadow-black/25 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-slate-900/95 sm:right-5 sm:top-[5.1rem]"
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10">
        <BrainCircuit className="h-4.5 w-4.5 text-cyan-200" />
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${state.enabled ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.9)]' : 'bg-slate-500'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-[.15em] text-cyan-200">Shruthi Self Learning</span>
        <span className="mt-0.5 block truncate text-[10px] text-slate-400">{state.enabled ? `${label(state.current_track)} · ${state.total_insights || 0} signals` : 'Paused'}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
    </Link>
  );
}
