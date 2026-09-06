'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ReorderReportPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      const { data, error: queryError } = await supabase
        .from('products')
        .select('id,name,sku,stock,reorder_level,cost_price,is_active')
        .eq('is_active', true)
        .order('stock', { ascending: true });
      if (queryError) setError(queryError.message); else setProducts(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const reorder = useMemo(() => products.filter(p => Number(p.stock || 0) <= Number(p.reorder_level ?? 10)), [products]);
  const units = reorder.reduce((sum, p) => sum + Math.max(Number(p.reorder_level ?? 10) - Number(p.stock || 0), 0), 0);
  const value = reorder.reduce((sum, p) => sum + Math.max(Number(p.reorder_level ?? 10) - Number(p.stock || 0), 0) * Number(p.cost_price || 0), 0);

  return <div className="p-6 max-w-[1200px] mx-auto space-y-6">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-xl font-black text-white uppercase">Reorder Report</h1><p className="text-sm text-slate-500 mt-1">Live products at or below their configured reorder level.</p></div><Link href="/inventory-management/reports" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold uppercase">Back to Reports</Link></div>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    <div className="grid md:grid-cols-3 gap-4"><Metric label="Products to reorder" value={reorder.length}/><Metric label="Minimum replacement units" value={units}/><Metric label="Indicative cost" value={`£${value.toFixed(2)}`}/></div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">{loading ? <div className="p-10 text-center text-slate-500">Loading live inventory…</div> : reorder.length === 0 ? <div className="p-12 text-center text-slate-500">No active products currently require reorder.</div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-950/60 text-[10px] uppercase text-slate-500"><tr><th className="p-4">Product</th><th className="p-4">SKU</th><th className="p-4">Stock</th><th className="p-4">Reorder level</th><th className="p-4">Suggested units</th><th className="p-4">Cost</th></tr></thead><tbody>{reorder.map(p => { const qty = Math.max(Number(p.reorder_level ?? 10) - Number(p.stock || 0), 0); return <tr key={p.id} className="border-t border-slate-800/70"><td className="p-4 font-semibold text-white">{p.name}</td><td className="p-4 text-slate-400">{p.sku || '—'}</td><td className="p-4 text-rose-300 font-bold">{p.stock ?? 0}</td><td className="p-4 text-amber-300">{p.reorder_level ?? 10}</td><td className="p-4 text-cyan-300 font-bold">{qty}</td><td className="p-4 text-slate-300">£{(qty * Number(p.cost_price || 0)).toFixed(2)}</td></tr>})}</tbody></table></div>}</div>
  </div>;
}

function Metric({ label, value }: { label: string; value: any }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="mt-1 text-xl font-black text-white">{value}</div></div>; }
