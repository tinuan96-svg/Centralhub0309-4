'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button, designTokens } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/lib/design-system/components/Badge';

export default function WhatsAppMarketing({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // Simulate loading stats
    setLoading(false);
  }, [selectedStore?.id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <PageHeader
          title="WhatsApp Marketing"
          subtitle="Send broadcasts and promotional messages to your opted-in customers."
        />
        <Button>+ New WhatsApp Campaign</Button>
      </div>

      <StatGrid columns={4}>
        <StatCard label="Broadcasts Sent" value="0" icon="📱" />
        <StatCard label="Avg. Read Rate" value="0%" icon="👀" />
        <StatCard label="Avg. Click Rate" value="0%" icon="🖱️" />
        <StatCard label="Revenue Generated" value="£0.00" icon="💰" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 bg-slate-900/50 border-slate-800">
               <h3 className="text-lg font-bold text-white mb-4">Recent Broadcasts</h3>
               <div className="p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">
                  No WhatsApp campaigns sent yet.
               </div>
            </Card>

            <Card className="p-6 bg-slate-900/50 border-slate-800">
               <h3 className="text-lg font-bold text-white mb-4">Approved Templates</h3>
               <p className="text-sm text-slate-400 mb-6">You can only use Meta-approved marketing templates for broadcasts.</p>
               <div className="flex justify-center py-10">
                  <Button variant="secondary" onClick={() => window.location.href='/customer-care/templates'}>
                    Manage Templates
                  </Button>
               </div>
            </Card>
         </div>

         <div className="lg:col-span-1 space-y-6">
            <Card className="p-6 bg-slate-900/50 border-slate-800">
               <h3 className="text-lg font-bold text-white mb-4">Opt-in Summary</h3>
               <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                     <span className="text-slate-400">Total Reachable</span>
                     <span className="text-white font-bold">0</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                     <span className="text-slate-400">Marketing Opt-ins</span>
                     <span className="text-white font-bold">0</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                     <span className="text-slate-400">Unsubscribe Rate</span>
                     <span className="text-red-400">0%</span>
                  </div>
               </div>
               <div className="mt-6 pt-6 border-t border-slate-800">
                  <Button variant="ghost" className="w-full text-[10px] border border-slate-700">View Subscribers</Button>
               </div>
            </Card>

            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
               <h4 className="text-xs font-bold text-amber-500 uppercase mb-2">Compliance Note</h4>
               <p className="text-[10px] text-slate-400 leading-relaxed">
                 Ensure all promotional messages follow WhatsApp Business Policies. High block rates can lead to account suspension.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}
