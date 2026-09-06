'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, Button, designTokens } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Badge } from '@/lib/design-system/components/Badge';
import { MarketingSegment } from '@/lib/types/marketing';
import { supabase } from '@/lib/supabase';

export default function CustomerSegments({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [intel, setIntel] = useState<any[]>([]);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const [segData, intelData] = await Promise.all([
        marketingService.getSegments(selectedStore?.id),
        supabase.from('customer_intelligence').select('lifecycle_stage')
      ]);
      setSegments(segData);
      setIntel(intelData.data || []);
    } catch (err) {
      console.error('Failed to load segments:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStore?.id]);

  const lifecycleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      new: 0, first_purchase: 0, active: 0, repeat: 0, loyal: 0, vip: 0, at_risk: 0, inactive: 0, churned: 0
    };
    intel.forEach(i => {
      if (counts[i.lifecycle_stage] !== undefined) counts[i.lifecycle_stage]++;
    });
    return counts;
  }, [intel]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customer Segments"
        subtitle="Dynamic audiences based on order behavior and product interests."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-2">
        {Object.entries(lifecycleCounts).map(([stage, count]) => (
          <Card key={stage} className="p-3 bg-slate-900/40 border-slate-800 flex flex-col items-center justify-center">
            <p className="text-[8px] text-slate-500 font-black uppercase text-center mb-1">{stage.replace(/_/g, ' ')}</p>
            <p className="text-lg font-bold text-white">{count}</p>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4">
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Custom Audience Segments</h3>
        <Button>+ Build Segment</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-10 text-center text-slate-500 italic">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="col-span-full p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">
             No custom segments found.
          </div>
        ) : (
          segments.map((segment) => (
            <Card key={segment.id} className="p-5 bg-slate-900/40 border-slate-800 flex flex-col justify-between hover:border-blue-500/30 transition-all cursor-pointer group">
               <div className="min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-3">
                     <h3 className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors truncate">{segment.name}</h3>
                     <Badge variant="info" className="text-[9px] shrink-0">{segment.member_count} Members</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2 min-h-[2.5rem]">{segment.description || 'No description provided.'}</p>
               </div>

               <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                  <span className="text-[10px] text-slate-500 uppercase">
                    Last sync: {segment.last_calculated_at ? new Date(segment.last_calculated_at).toLocaleDateString() : 'Never'}
                  </span>
                  <Button variant="ghost" className="text-[10px] h-7 px-3 border border-slate-700">Manage</Button>
               </div>
            </Card>
          ))

        )}
      </div>
    </div>
  );
}
