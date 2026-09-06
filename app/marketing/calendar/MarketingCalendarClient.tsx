'use client';

import { useState } from 'react';
import { PageHeader, Card, Button, designTokens } from '@/lib/design-system';
import { Badge } from '@/lib/design-system/components/Badge';

export default function MarketingCalendar({ params, searchParams }: { params: any; searchParams: any }) {
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Content Calendar"
          subtitle="Plan and schedule your marketing activities across all channels."
        />
        <div className="flex gap-2">
           <div className="bg-slate-800 p-1 rounded-lg flex gap-1">
              {(['month', 'week', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                    view === v ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
           </div>
           <Button>+ Schedule Content</Button>
        </div>
      </div>

      <Card className="p-0 bg-slate-900/50 border-slate-800 overflow-hidden min-h-[600px] flex flex-col">
         <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
            <h3 className="font-bold text-white">August 2026</h3>
            <div className="flex gap-2">
               <Button variant="secondary" className="h-8 px-2 text-xs">←</Button>
               <Button variant="secondary" className="h-8 px-4 text-xs">Today</Button>
               <Button variant="secondary" className="h-8 px-2 text-xs">→</Button>
            </div>
         </div>

         {view === 'month' && (
           <div className="flex-1 grid grid-cols-7 h-full">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase border-b border-r border-slate-800">
                  {d}
                </div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => (
                <div key={i} className="min-h-[100px] p-2 border-b border-r border-slate-800 hover:bg-slate-800/30 transition-colors group cursor-pointer">
                   <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-400">{i + 1}</span>
                </div>
              ))}
           </div>
         )}

         {view !== 'month' && (
           <div className="flex-1 flex items-center justify-center p-20 text-slate-500 italic">
              Calendar {view} view is coming soon.
           </div>
         )}
      </Card>
    </div>
  );
}
