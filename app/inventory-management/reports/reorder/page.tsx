'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ReorderReportPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('products')
      .select('id,name,sku,stock,reorder_level,cost_price,is_active,is_deleted')
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('stock', { ascending: true });
    if (queryError) setError(queryError.message); else setProducts(data || []);
    if (showLoader) setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
    const channel = supabase.channel('reorder-report-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const reorder = useMemo(() => products.filter(product => Number(product.stock || 0) <= Number(product.reorder_level ?? 10)), [products]);
  const units = reorder.reduce((sum, product) => sum + Math.max(Number(product.reorder_level ?? 10) - Number(product.stock || 0), 0), 0);
  const value = reorder.reduce((sum, product) => sum + Math.max(Number(product.reorder_level ?? 10) - Number(product.stock || 0), 0) * Number(product.cost_price || 0), 0);

  return <main className="mx-auto max-w-[1200px] space-y-6 p-4 pb-24 fold-inner:p-6 fold-inner:pb-8">
    <header className="flex flex-col gap-3 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between"><div><h1 className="text-xl font-black text-white uppercase">Reorder Report</h1><p className="text-sm text-slate-500 mt-1">Active, non-deleted products at or below their configured reorder level.</p></div><Link href="/inventory-management/reports" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold uppercase">Back to Reports</Link></header>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
    <section className="grid grid-cols-1 fold-inner:grid-cols-3 gap-4"><Metric label="Products to reorder" value={reorder.length}/><Metric label="Minimum replacement units" value={units}/><Metric label="Indicative cost" value={`£${value.toFixed(2)}`}/></section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">{loading ? <div className="p-10 text-center text-slate-500">Loading live inventory…</div> : reorder.length === 0 ? <div className="p-12 text-center text-slate-500">No active products currently require reorder.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-950/60 text-[10px] uppercase text-slate-500"><tr><th className="p-4">Product</th><th className="p-4">SKU</th><th className="p-4">Stock</th><th className="p-4">Reorder level</th><th className="p-4">Suggested units</th><th className="p-4">Cost</th></tr></thead><tbody>{reorder.map(product => { const quantity = Math.max(Number(product.reorder_level ?? 10) - Number(product.stock || 0), 0); return <tr key={product.id} className="border-t border-slate-800/70"><td className="p-4 font-semibold text-white">{product.name}</td><td className="p-4 text-slate-400">{product.sku || '—'}</td><td className="p-4 text-rose-300 font-bold">{product.stock ?? 0}</td><td className="p-4 text-amber-300">{product.reorder_level ?? 10}</td><td className="p-4 text-cyan-300 font-bold">{quantity}</td><td className="p-4 text-slate-300">£{(quantity * Number(product.cost_price || 0)).toFixed(2)}</td></tr>})}</tbody></table></div>}</section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500 uppercase">{label}</div><div className="mt-1 text-xl font-black text-white">{value}</div></div>;
}
