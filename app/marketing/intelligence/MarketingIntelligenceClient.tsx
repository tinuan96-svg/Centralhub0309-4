'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, Button, Badge } from '@/lib/design-system';
import { intelligenceService } from '@/lib/services/marketing/intelligenceService';
import { approvalService } from '@/lib/services/marketing/approvalService';
import { campaignOpportunityService } from '@/lib/services/marketing/campaignOpportunityService';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import PromotionSimulator from './PromotionSimulator';
import MarketingOpportunities from './MarketingOpportunities';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function MarketingIntelligenceClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'simulator' | 'opportunities'>('recommendations');
  const [processing, setProcessing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('intelligence_recommendations')
        .select('*');

      if (selectedStoreId) {
        query = query.eq('store_id', selectedStoreId);
      } else {
        query = query.is('store_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setRecommendations(data || []);
    } catch (err) {
      console.error('Failed to load marketing recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  const handleRunAnalysis = async () => {
    setRefreshing(true);
    try {
      // Trigger a batch scan for marketing opportunities
      await campaignOpportunityService.getAllOpportunities(20);
      // In a real scenario, this would trigger an Edge Function or background job
      // to generate intelligence_recommendations entries.
      await loadRecommendations();
    } catch (err) {
       console.error('Marketing analysis failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (processing) return;
    setProcessing(id);
    try {
      await approvalService.approveAndExecute(id);
      await loadRecommendations();
      alert('Recommendation executed successfully!');
    } catch (err: any) {
      console.error('Approval failed:', err);
      alert('Execution failed: ' + err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (processing) return;
    try {
      await approvalService.rejectRecommendation(id, 'User rejected in Phase 2 UI');
      await loadRecommendations();
    } catch (err) {
      console.error('Rejection failed:', err);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  return (
    <div className="p-6 space-y-6">
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 mb-4">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>
      <PageHeader
        title="Intelligence Layer"
        subtitle="AI-driven growth opportunities and performance simulations."
        action={
          <div className="flex gap-2">
             <Button onClick={handleRunAnalysis} disabled={refreshing}>
                {refreshing ? 'Analyzing...' : 'Run Opportunity Scan'}
             </Button>
             <Button onClick={() => setActiveTab('recommendations')} variant={activeTab === 'recommendations' ? 'primary' : 'secondary'}>RECOMMENDATIONS</Button>
             <Button onClick={() => setActiveTab('opportunities')} variant={activeTab === 'opportunities' ? 'primary' : 'secondary'}>OPPORTUNITIES</Button>
             <Button onClick={() => setActiveTab('simulator')} variant={activeTab === 'simulator' ? 'primary' : 'secondary'}>SIMULATOR</Button>
          </div>
        }
      />

      {activeTab === 'simulator' ? (
        <PromotionSimulator storeId={selectedStoreId} />
      ) : activeTab === 'opportunities' ? (
        <MarketingOpportunities storeId={selectedStoreId} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-500 italic">Analyzing store performance...</div>
          ) : recommendations.length === 0 ? (
            <div className="col-span-full py-20 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
               <div className="text-4xl mb-4">🧠</div>
               <h3 className="text-lg font-bold text-white mb-2">No recommendations found</h3>
               <p className="text-sm text-slate-500">The AI will generate insights as it processes your store data.</p>
            </div>
          ) : (
            recommendations.map((rec) => (
              <Card key={rec.id} className={`p-6 bg-slate-900/50 border-slate-800 flex flex-col justify-between group hover:border-blue-500/30 transition-all ${rec.status === 'executed' ? 'opacity-60' : ''}`}>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                       <Badge variant={rec.confidence > 0.8 ? 'success' : 'info'}>
                          {Math.round(rec.confidence * 100)}% CONFIDENCE
                       </Badge>
                       {rec.status === 'executed' && <Badge variant="paid">EXECUTED</Badge>}
                       {rec.is_stale && <Badge variant="danger">STALE</Badge>}
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase">{rec.recommendation_type.replace(/_/g, ' ')}</span>
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2">{rec.title}</h4>
                  <p className="text-sm text-slate-400 mb-6 leading-relaxed">{rec.description}</p>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                     <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Impact</p>
                        <p className="text-xs text-emerald-400 font-medium">{rec.expected_impact}</p>
                     </div>
                     <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Risk Level</p>
                        <Badge variant={rec.risk_level === 3 ? 'danger' : rec.risk_level === 2 ? 'warning' : 'info'} className="text-[9px]">
                           LEVEL {rec.risk_level || 0}
                        </Badge>
                     </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reasoning</p>
                    <p className="text-xs text-slate-400 italic">&quot;{rec.reason}&quot;</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {rec.status === 'recommended' || rec.status === 'reviewed' ? (
                    <>
                      <Button
                        onClick={() => handleApprove(rec.id)}
                        className="flex-1 text-xs font-black"
                        disabled={processing === rec.id || rec.is_stale}
                      >
                        {processing === rec.id ? 'EXECUTING...' : 'APPROVE & EXECUTE'}
                      </Button>
                      <Button
                        onClick={() => handleReject(rec.id)}
                        variant="secondary"
                        className="flex-1 text-xs font-black"
                        disabled={processing === rec.id}
                      >
                        REJECT
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full text-xs" variant="secondary" disabled>
                      {rec.status.toUpperCase()}
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      <section className="mt-12">
         <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Attribution Intelligence</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AttributionCard model="last_touch" storeId={selectedStoreId} />
            <AttributionCard model="first_touch" storeId={selectedStoreId} />
         </div>
      </section>
    </div>
  );
}

function AttributionCard({ model, storeId }: { model: string, storeId: string | null }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttribution = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('marketing_attribution_results')
          .select('*, orders!inner(store_id)')
          .eq('attribution_model', model);

        if (storeId) {
           query = query.eq('orders.store_id', storeId);
        }

        const { data: results } = await query
          .order('created_at', { ascending: false })
          .limit(5);

        setData(results || []);
      } catch (err) {
        console.error('Attribution fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttribution();
  }, [model, storeId]);

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800">
       <div className="flex justify-between items-center mb-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{model.replace('_', ' ')}</h4>
          <Badge variant="info">ACTIVE</Badge>
       </div>
       <div className="space-y-3">
          {data.map((item, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
               <span className="text-slate-400">{item.utm_source || 'Direct'} / {item.utm_campaign || 'N/A'}</span>
               <span className="font-bold text-emerald-400">+{formatCurrency(item.attributed_revenue || 0)}</span>
            </div>
          ))}
          {data.length === 0 && <p className="text-center py-4 text-slate-500 italic text-xs">No attribution data for this store.</p>}
       </div>
    </Card>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val);
}
