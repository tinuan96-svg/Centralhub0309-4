'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Badge, Button } from '@/lib/design-system';
import { campaignOpportunityService, MarketingOpportunity } from '@/lib/services/marketing/campaignOpportunityService';

export default function MarketingOpportunities({ storeId }: { storeId?: string | null }) {
  const [opportunities, setOpportunities] = useState<MarketingOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignOpportunityService.getAllOpportunities(10, storeId);
      setOpportunities(data);
    } catch (err) {
      console.error('Failed to load marketing opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <div className="py-10 text-center text-slate-500 italic">Scanning catalog for opportunities...</div>;

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800">
      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Marketing Opportunities</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Purchase Need</th>
              <th className="px-4 py-3">Safety</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {opportunities.map(opp => (
              <tr key={opp.product_id} className="text-sm hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-200 font-medium">{opp.product_name}</td>
                <td className="px-4 py-3">
                  <Badge variant={
                    opp.opportunity_type === 'SAFE_TO_PROMOTE' ? 'success' :
                    opp.opportunity_type === 'CLEARANCE_OPPORTUNITY' ? 'info' :
                    opp.opportunity_type === 'DO_NOT_PROMOTE' ? 'danger' : 'warning'
                  }>
                    {opp.opportunity_type.replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-slate-300 font-mono">{opp.stock}</td>
                <td className="px-4 py-3 text-right text-slate-300">{opp.margin_percent}%</td>
                <td className="px-4 py-3 text-right">
                  {opp.recommended_qty > 0 ? (
                    <span className="text-amber-400 font-bold">+{opp.recommended_qty}</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                   <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden max-w-[60px]">
                      <div
                        className={`h-full rounded-full ${opp.safety_score > 80 ? 'bg-emerald-500' : opp.safety_score > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${opp.safety_score}%` }}
                      />
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
