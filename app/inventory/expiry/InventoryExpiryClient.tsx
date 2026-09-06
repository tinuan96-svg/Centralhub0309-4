'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductImage from '@/components/ProductImage';

export default function ExpiryPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expired' | '7days' | '30days'>('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, stock, expiry_date, image_url')
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true });
    setData(products || []);
    setLoading(false);
  };

  const getDaysDiff = (dateStr: string) => {
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredData = data.filter(p => {
    const days = getDaysDiff(p.expiry_date);
    if (filter === 'expired') return days < 0;
    if (filter === '7days') return days >= 0 && days <= 7;
    if (filter === '30days') return days >= 0 && days <= 30;
    return true;
  });

  if (loading) return <div className="p-8 text-center text-slate-400">Analyzing expiration dates...</div>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <span className="text-3xl">📅</span> Expiry Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">Track products nearing expiration to minimize wastage</p>
      </div>

      <div className="flex gap-2">
        {['all', 'expired', '7days', '30days'].map(f => (
          <button key={f} onClick={() => setFilter(f as any)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all border ${filter === f ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-slate-800 text-slate-500 border-transparent'}`}>{f === 'all' ? 'Show All' : f.replace('days', ' Days')}</button>
        ))}
      </div>

      {filteredData.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center">
          <span className="text-4xl mb-4 block opacity-20">✅</span>
          <p className="text-slate-400">No products with expiry dates matching this filter.</p>
          <p className="text-xs text-slate-600 mt-2">Set expiry dates on products to see them here.</p>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              <tr><th className="px-6 py-4">Product</th><th className="px-6 py-4 text-center">Expiry Date</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Current Stock</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredData.map(p => {
                const days = getDaysDiff(p.expiry_date);
                return (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-slate-800 overflow-hidden"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div><div><p className="font-bold text-slate-200">{p.name}</p><p className="text-[10px] text-slate-500 font-mono">{p.sku}</p></div></div></td>
                    <td className="px-6 py-4 text-center font-mono text-slate-300">{new Date(p.expiry_date).toLocaleDateString('en-GB')}</td>
                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${days < 0 ? 'bg-rose-500 text-white' : days <= 7 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-emerald-500/10 text-emerald-400'}`}>{days < 0 ? 'EXPIRED' : days === 0 ? 'TODAY' : `In ${days} Days`}</span></td>
                    <td className="px-6 py-4 text-right font-bold text-slate-100">{p.stock}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
