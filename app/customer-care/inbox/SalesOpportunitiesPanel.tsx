'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

interface Recommendation {
  id: string;
  product_id: string;
  recommendation_type: string;
  reason: string;
  status: string;
  product: {
    name: string;
    price: number;
    brand: string | null;
    image_url: string | null;
    sku: string | null;
  };
}

export default function SalesOpportunitiesPanel({ conversationId, onInsertProduct }: {
    conversationId: string;
    onInsertProduct: (product: any) => void;
}) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (conversationId) {
      loadRecommendations();

      // Realtime listener for new AI suggestions
      const sub = supabase
        .channel(`sales_recs_${conversationId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sales_recommendations',
            filter: `conversation_id=eq.${conversationId}`
        }, () => {
            loadRecommendations();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(sub);
      };
    }
  }, [conversationId]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sales_recommendations')
        .select('*, product:products(name, price, brand, image_url, sku)')
        .eq('conversation_id', conversationId)
        .eq('status', 'suggested')
        .order('created_at', { ascending: false });

      setRecommendations(data || []);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  if (recommendations.length === 0 && !loading) return null;

  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
            <span>🔥</span> Sales Opportunities
        </h4>
        <Badge variant="warning" className="text-[9px]">{recommendations.length}</Badge>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <Card key={rec.id} className="p-3 bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 transition-all group">
            <div className="flex gap-3">
               {rec.product.image_url ? (
                   <img src={rec.product.image_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-800" />
               ) : (
                   <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-xl">📦</div>
               )}
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tighter">{rec.recommendation_type.replace('_', ' ')}</span>
                    <span className="text-[10px] font-black text-slate-200">{formatCurrency(rec.product.price)}</span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-100 truncate mb-1">{rec.product.name}</h5>
                  <p className="text-[10px] text-slate-400 italic line-clamp-1">&quot;{rec.reason}&quot;</p>
               </div>
            </div>

            <div className="mt-3 flex gap-2">
                <Button
                    variant="secondary"
                    className="flex-1 text-[10px] h-7 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-200"
                    onClick={() => onInsertProduct(rec.product)}
                >
                    Add to Reply
                </Button>
                <Button
                    variant="ghost"
                    className="text-[10px] h-7 text-slate-500 hover:text-slate-300"
                    onClick={async () => {
                        await supabase.from('sales_recommendations').update({ status: 'ignored' }).eq('id', rec.id);
                        loadRecommendations();
                    }}
                >
                    Ignore
                </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
