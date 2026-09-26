'use client';

import { Database, ShieldCheck, XCircle } from 'lucide-react';
import { useDemoMode } from '@/lib/hooks/useDemoMode';

export default function DemoModeBanner() {
  const { isDemo, activateLive } = useDemoMode();
  if (!isDemo) return null;

  return (
    <div
      role="status"
      aria-label="CentralHub demo mode"
      className="z-30 flex min-h-10 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300/30 bg-amber-300/10 px-3 py-2 text-center text-[11px] font-bold text-amber-100 backdrop-blur"
    >
      <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.14em]"><Database size={13} /> Demo mode</span>
      <span className="inline-flex items-center gap-1.5 text-amber-50/85"><ShieldCheck size={13} /> Sanitised CentralHub Shop data · external actions disabled</span>
      <button
        type="button"
        onClick={activateLive}
        className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-amber-200/30 bg-amber-100/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-amber-100/20"
      >
        <XCircle size={12} /> Exit demo
      </button>
    </div>
  );
}
