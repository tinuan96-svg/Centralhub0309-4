'use client';

import { useState } from 'react';
import { PageHeader, Card, Button, designTokens } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { Badge } from '@/lib/design-system/components/Badge';

export default function NewCampaignWizardClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [step, setStep] = useState(1);
  const { stores } = useStore();
  const [formData, setFormData] = useState({
    name: '',
    objective: 'traffic',
    type: 'conversions',
    selectedStores: [] as string[],
    allStores: true,
    platform: 'multi',
    budget: 0,
    startDate: '',
    endDate: ''
  });

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Create Marketing Campaign"
        subtitle={`Step ${step} of 5: ${
          step === 1 ? 'Basic Information' :
          step === 2 ? 'Store Targeting' :
          step === 3 ? 'Audience & Channel' :
          step === 4 ? 'Budget & Content' : 'Review & Launch'
        }`}
      />

      <div className="mb-8 flex gap-2">
         {[1, 2, 3, 4, 5].map(s => (
           <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-slate-800'}`} />
         ))}
      </div>

      <Card className="p-8 bg-slate-900/50 border-slate-800">
        {step === 1 && (
          <div className="space-y-6">
             <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Campaign Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Summer Sale 2026"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                />
             </div>
             <div className="grid grid-cols-2 gap-6">
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Objective</label>
                   <select
                     value={formData.objective}
                     onChange={e => setFormData({ ...formData, objective: e.target.value })}
                     className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                   >
                      <option value="traffic">Drive Traffic</option>
                      <option value="conversions">Increase Conversions</option>
                      <option value="awareness">Brand Awareness</option>
                   </select>
                </div>
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Campaign Type</label>
                   <select
                     value={formData.type}
                     onChange={e => setFormData({ ...formData, type: e.target.value })}
                     className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                   >
                      <option value="retargeting">Retargeting</option>
                      <option value="prospecting">New Customer Acquisition</option>
                      <option value="loyalty">Customer Loyalty</option>
                   </select>
                </div>
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
             <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setFormData({ ...formData, allStores: true, selectedStores: [] })}
                  className={`flex-1 p-6 rounded-2xl border transition-all text-center ${formData.allStores ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                >
                   <div className="text-2xl mb-2">🏪</div>
                   <div className="font-bold text-sm sm:text-base">All Stores</div>
                   <div className="text-[10px] opacity-60">Target every store in your network</div>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, allStores: false })}
                  className={`flex-1 p-6 rounded-2xl border transition-all text-center ${!formData.allStores ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                >
                   <div className="text-2xl mb-2">🎯</div>
                   <div className="font-bold text-sm sm:text-base">Select Stores</div>
                   <div className="text-[10px] opacity-60">Target specific stores only</div>
                </button>
             </div>

             {!formData.allStores && (
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                  {stores.map(store => (
                    <label key={store.id} className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                       <input
                         type="checkbox"
                         checked={formData.selectedStores.includes(store.id)}
                         onChange={(e) => {
                            if (e.target.checked) setFormData({ ...formData, selectedStores: [...formData.selectedStores, store.id] });
                            else setFormData({ ...formData, selectedStores: formData.selectedStores.filter(id => id !== store.id) });
                         }}
                         className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                       />
                       <span className="text-sm font-medium text-slate-200 truncate">{store.name}</span>
                    </label>
                  ))}
               </div>
             )}
          </div>
        )}


        {step === 3 && (
           <div className="space-y-6">
              <p className="text-sm text-slate-400 italic text-center py-10">Step 3: Audience selection logic coming soon...</p>
           </div>
        )}

        {step === 4 && (
           <div className="space-y-6">
              <p className="text-sm text-slate-400 italic text-center py-10">Step 4: Budget and Content builder coming soon...</p>
           </div>
        )}

        {step === 5 && (
           <div className="space-y-6">
              <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-xl">
                 <h4 className="font-bold text-blue-400 mb-2">Campaign Ready to Launch</h4>
                 <p className="text-sm text-slate-300">Please review all information before activating the campaign.</p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 space-y-4">
                 <div className="flex justify-between border-b border-slate-700 pb-2">
                    <span className="text-slate-400 text-sm">Name</span>
                    <span className="text-white font-bold">{formData.name}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-700 pb-2">
                    <span className="text-slate-400 text-sm">Objective</span>
                    <span className="text-white font-bold uppercase">{formData.objective}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Targeting</span>
                    <span className="text-white font-bold">{formData.allStores ? 'All Stores' : `${formData.selectedStores.length} Stores`}</span>
                 </div>
              </div>
           </div>
        )}

        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row gap-3 sm:justify-between">
           <Button variant="secondary" onClick={step === 1 ? () => window.history.back() : prevStep} className="w-full sm:w-auto">
              {step === 1 ? 'Cancel' : 'Back'}
           </Button>
           <Button onClick={step === 5 ? () => {} : nextStep} disabled={step === 1 && !formData.name} className="w-full sm:w-auto">
              {step === 5 ? 'Launch Campaign' : 'Next Step'}
           </Button>
        </div>

      </Card>
    </div>
  );
}
