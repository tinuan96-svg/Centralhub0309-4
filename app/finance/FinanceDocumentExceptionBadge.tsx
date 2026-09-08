'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function FinanceDocumentExceptionBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { count: exceptionCount, error } = await supabase
        .from('v_finance_document_exceptions')
        .select('id', { count: 'exact', head: true });
      if (active && !error) setCount(exceptionCount || 0);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (count === null) return null;

  return (
    <div className={`mt-3 inline-flex items-center gap-3 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${count ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
      <span>Finance document exceptions</span>
      <strong className="text-sm">{count}</strong>
      <span className="font-medium normal-case tracking-normal opacity-80">{count ? 'Needs review before accounting/VAT posting' : 'No unresolved document exceptions'}</span>
    </div>
  );
}
