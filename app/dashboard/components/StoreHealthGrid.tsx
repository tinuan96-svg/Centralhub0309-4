'use client';

import { StoreStats } from '@/lib/services/storeStatsService';
import StoreCard from '@/components/StoreCard';
import Link from 'next/link';

export default function StoreHealthGrid({ stats }: { stats: StoreStats[] }) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-100 uppercase tracking-tighter flex items-center gap-2">
          <span>🏪</span> Network Operations
        </h2>
        <Link href="/stores" className="text-[10px] font-black text-cyan-400 uppercase tracking-widest hover:text-cyan-300 transition-colors">
          View Expansion Registry →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {stats.map(s => (
          <StoreCard key={s.storeId} stats={s as any} />
        ))}
        {stats.length === 0 && (
           <div className="col-span-full py-12 text-center bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
             <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No stores registered in network</p>
           </div>
        )}
      </div>
    </section>
  );
}
