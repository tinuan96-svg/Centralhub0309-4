'use client';

import { useState } from 'react';
import SalesGraphDashboard from '@/components/master-data/SalesGraphDashboard';
import InventoryCategoriesClient from './InventoryCategoriesClient';

type Tab = 'graphs' | 'manage';

export default function CategorySalesSection() {
  const [tab, setTab] = useState<Tab>('graphs');

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-2">
      <button type="button" onClick={() => setTab('graphs')} className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${tab === 'graphs' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/30' : 'text-slate-500 hover:text-slate-200'}`}>📊 Sales graphs</button>
      <button type="button" onClick={() => setTab('manage')} className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${tab === 'manage' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}>⚙️ Manage categories</button>
      <span className="ml-auto hidden text-[9px] font-black uppercase tracking-widest text-slate-600 md:block">Graphs are the default commercial view</span>
    </div>
    {tab === 'graphs' ? <SalesGraphDashboard focus="category" /> : <InventoryCategoriesClient />}
  </div>;
}
