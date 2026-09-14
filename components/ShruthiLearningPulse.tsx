'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
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

  const count = Math.max(0, Number(state.total_insights || 0));
  const countLabel = count > 99 ? '99+' : String(count);
  const title = `Shruthi Self Learning · ${state.enabled ? `${label(state.current_track)} · ${count} signals` : 'Paused'}`;

  return (
    <Link
      href="/shruthi-learning"
      aria-label={title}
      title={title}
      className="fixed right-2 top-1/2 z-[68] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl border border-cyan-300/20 bg-slate-950/90 text-white shadow-xl shadow-black/25 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-slate-900/95 active:scale-95 sm:right-3 sm:h-13 sm:w-13"
    >
      <BrainCircuit className="h-5 w-5 text-cyan-200" />
      <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${state.enabled ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.9)]' : 'bg-slate-500'}`} />
      <span className="absolute -bottom-1 -left-1 min-w-5 rounded-full border border-cyan-300/20 bg-slate-950 px-1 py-0.5 text-center text-[8px] font-black leading-none text-cyan-100">{countLabel}</span>
    </Link>
  );
}
