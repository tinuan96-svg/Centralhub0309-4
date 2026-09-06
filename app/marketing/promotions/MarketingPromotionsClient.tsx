'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Badge } from '@/lib/design-system/components/Badge';
import { Promotion } from '@/lib/types/marketing';

export default function PromotionManager({ params, searchParams }: { params: any; searchParams: any }) {
  const { selectedStore } = useStore();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try { setPromotions(await marketingService.getPromotions(selectedStore?.id)); }
    catch (err) { console.error('Failed to load promotions:', err); }
    finally { setLoading(false); }
  }, [selectedStore?.id]);
  useEffect(() => { loadPromotions(); }, [loadPromotions]);
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start"><PageHeader title="Promotion Manager" subtitle="Manage discount codes, product offers and store-wide promotions." /><Button>+ New Promotion</Button></div>
      <div className="grid gap-3">
        {loading ? <div className="p-10 text-center text-slate-500 italic">Loading promotions...</div> : promotions.length === 0 ? <div className="p-10 text-center text-slate-500 italic border border-dashed border-slate-800 rounded-2xl">No promotions found. Create one to drive conversions.</div> : promotions.map((promo) => {
          const discountType = promo.discount_type || 'discount';
          return <Card key={promo.id} className="p-4 bg-slate-900/40 border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-slate-700 transition-all">
            <div className="flex items-center gap-4 min-w-0"><div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-lg shrink-0">🏷️</div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-bold text-slate-100 truncate">{promo.name}</h3>{promo.coupon_code && <code className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-blue-400 font-mono border border-slate-700 shrink-0">{promo.coupon_code}</code>}</div><p className="text-[10px] text-slate-500 uppercase tracking-tight truncate">{discountType.replace('_', ' ')} • {promo.discount_value}{discountType === 'percentage' ? '%' : ' GBP'}</p></div></div>
            <div className="flex items-center justify-between sm:justify-end gap-6 border-t border-slate-800 sm:border-0 pt-3 sm:pt-0"><div className="hidden lg:block text-right"><p className="text-[10px] text-slate-500 uppercase">Usage</p><p className="text-sm font-bold text-white">0 / {promo.usage_limit || '∞'}</p></div><Badge variant={promo.status === 'active' ? 'success' : 'warning'} className="text-[10px]">{promo.status}</Badge><div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"><Button variant="secondary" className="text-[10px] h-8 px-3">Edit</Button></div></div>
          </Card>;
        })}
      </div>
    </div>
  );
}
