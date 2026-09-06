'use client';

import { PageHeader, Card, Button } from '@/lib/design-system';

export default function MarketingSettings({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Marketing Settings"
        subtitle="Configure tracking, attribution models, and global marketing preferences."
      />

      <div className="max-w-3xl space-y-6">
         <Card className="p-6 bg-slate-900/50 border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">Attribution Configuration</h3>
            <div className="space-y-4">
               <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Attribution Model</label>
                  <select className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
                     <option value="last_click">Last Click (Default)</option>
                     <option value="first_click">First Click</option>
                     <option value="linear">Linear Distribution</option>
                  </select>
               </div>
               <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Conversion Window (Days)</label>
                  <input type="number" defaultValue={30} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
               </div>
            </div>
         </Card>

         <Card className="p-6 bg-slate-900/50 border-slate-800">
            <h3 className="text-lg font-bold text-white mb-4">UTM Parameters</h3>
            <p className="text-sm text-slate-400 mb-6">CentralHub automatically generates UTM links for all campaigns using these defaults.</p>
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Source</label>
                     <input type="text" defaultValue="centralhub" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Default Medium</label>
                     <input type="text" defaultValue="internal" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
               </div>
            </div>
         </Card>

         <div className="flex justify-end pt-6">
            <Button>Save Settings</Button>
         </div>
      </div>
    </div>
  );
}
