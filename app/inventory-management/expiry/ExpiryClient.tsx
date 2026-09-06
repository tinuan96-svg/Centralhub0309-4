'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductImage from '@/components/ProductImage';

type ExpiryProduct = {
  id: string;
  name: string;
  sku: string | null;
  stock: number | null;
  cost_price: number | null;
  expiry_date: string;
  image_url: string | null;
};

type InventoryRow = {
  product_id: string;
  stock_quantity: number | null;
  cost_price: number | null;
};

type ExpiryWriteoff = {
  id: string;
  product_id: string | null;
  quantity: number;
  unit_cost: number | string;
  total_cost: number | string;
  expiry_date: string;
  recorded_at: string;
};

type Filter = 'all' | 'expired' | '7days' | '30days';

const money = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);

export default function ExpiryClient() {
  const [data, setData] = useState<ExpiryProduct[]>([]);
  const [writeoffs, setWriteoffs] = useState<ExpiryWriteoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { void loadData(); }, []);

  const loadData = async () => {
    setLoading(true);

    const [productsResult, inventoryResult, writeoffsResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, sku, stock, cost_price, expiry_date, image_url')
        .not('expiry_date', 'is', null)
        .eq('is_deleted', false)
        .order('expiry_date', { ascending: true }),
      supabase
        .from('central_inventory')
        .select('product_id, stock_quantity, cost_price'),
      supabase
        .from('inventory_expiry_writeoffs')
        .select('id, product_id, quantity, unit_cost, total_cost, expiry_date, recorded_at')
        .order('recorded_at', { ascending: true }),
    ]);

    if (productsResult.error) console.error('[Expiry] Failed to load products:', productsResult.error);
    if (inventoryResult.error) console.error('[Expiry] Failed to load central inventory; product values are used only as a fallback:', inventoryResult.error);
    if (writeoffsResult.error) console.error('[Expiry] Failed to load permanent write-off history:', writeoffsResult.error);

    const inventoryByProduct = new Map<string, InventoryRow>();
    for (const row of (inventoryResult.data || []) as InventoryRow[]) inventoryByProduct.set(row.product_id, row);

    const merged = ((productsResult.data || []) as ExpiryProduct[]).map((product) => {
      const inventory = inventoryByProduct.get(product.id);
      return {
        ...product,
        stock: inventory?.stock_quantity ?? product.stock,
        cost_price: inventory?.cost_price ?? product.cost_price,
      };
    });

    setData(merged);
    setWriteoffs((writeoffsResult.data || []) as ExpiryWriteoff[]);
    setLoading(false);
  };

  const getDaysDiff = (dateStr: string) => {
    const expiry = new Date(`${dateStr}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((expiry.getTime() - now.getTime()) / 86_400_000);
  };

  const filteredData = useMemo(() => data.filter(p => {
    const days = getDaysDiff(p.expiry_date);
    if (filter === 'expired') return days < 0;
    if (filter === '7days') return days >= 0 && days <= 7;
    if (filter === '30days') return days >= 0 && days <= 30;
    return true;
  }), [data, filter]);

  const stats = useMemo(() => {
    let expiredProducts = 0;
    let expiredUnits = 0;
    let expiredValue = 0;
    let risk30Value = 0;

    for (const p of data) {
      const days = getDaysDiff(p.expiry_date);
      const stock = Math.max(0, Number(p.stock || 0));
      const value = stock * Math.max(0, Number(p.cost_price || 0));
      if (days < 0 && stock > 0) {
        expiredProducts += 1;
        expiredUnits += stock;
        expiredValue += value;
      } else if (days >= 0 && days <= 30 && stock > 0) {
        risk30Value += value;
      }
    }

    const historicalWriteoffValue = writeoffs.reduce((sum, row) => sum + Math.max(0, Number(row.total_cost || 0)), 0);
    return { expiredProducts, expiredUnits, expiredValue, risk30Value, historicalWriteoffValue };
  }, [data, writeoffs]);

  const trend = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
        year: d.getFullYear(),
        value: 0,
      };
    });
    const byKey = new Map(buckets.map(b => [b.key, b]));

    for (const row of writeoffs) {
      const d = new Date(row.recorded_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = byKey.get(key);
      if (bucket) bucket.value += Math.max(0, Number(row.total_cost || 0));
    }

    return buckets;
  }, [writeoffs]);

  const maxTrend = Math.max(...trend.map(x => x.value), 1);

  if (loading) return <div className="p-8 text-center text-slate-400">Analyzing expiration dates...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 pb-28">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Grocery Expiry Management</h1>
          <p className="text-sm text-slate-500 mt-1">Track expiry exposure from central inventory and retain permanent loss history when expired stock is cleared.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'expired', '7days', '30days'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all border ${filter === f ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-slate-800 text-slate-500 border-transparent'}`}>
              {f === 'all' ? 'Show All' : f === 'expired' ? 'Expired' : f.replace('days', ' Days')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-rose-300 font-black">Expired stock value</p>
          <p className="text-2xl font-black text-white mt-2">{money(stats.expiredValue)}</p>
          <p className="text-xs text-slate-500 mt-1">Current held stock at central inventory cost</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-slate-400 font-black">Expired products</p>
          <p className="text-2xl font-black text-white mt-2">{stats.expiredProducts.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">SKUs currently holding expired stock</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-slate-400 font-black">Expired units</p>
          <p className="text-2xl font-black text-white mt-2">{stats.expiredUnits.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Units exposed to expiry loss</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-amber-300 font-black">At risk · next 30 days</p>
          <p className="text-2xl font-black text-white mt-2">{money(stats.risk30Value)}</p>
          <p className="text-xs text-slate-500 mt-1">Current stock cost potentially expiring</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-violet-300 font-black">Recorded expiry losses</p>
          <p className="text-2xl font-black text-white mt-2">{money(stats.historicalWriteoffValue)}</p>
          <p className="text-xs text-slate-500 mt-1">Permanent ledger · does not disappear after stock removal</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Recorded Expiry Losses · 12 Months</h2>
            <p className="text-xs text-slate-500 mt-1">Permanent write-offs grouped by the date expired inventory was reduced or cleared.</p>
          </div>
          <p className="text-[10px] text-slate-600">Future stock reductions after expiry are captured automatically.</p>
        </div>
        <div className="h-56 flex items-end gap-2 sm:gap-3 border-b border-slate-800 pb-1">
          {trend.map((month) => {
            const height = month.value > 0 ? Math.max(8, (month.value / maxTrend) * 100) : 2;
            return (
              <div key={month.key} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group">
                <div className="text-[9px] text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{money(month.value)}</div>
                <div title={`${month.label} ${month.year}: ${money(month.value)}`} className="w-full max-w-10 rounded-t-md bg-violet-500/70 hover:bg-violet-400 transition-all" style={{ height: `${height}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 sm:gap-3 pt-2">
          {trend.map(month => <div key={month.key} className="flex-1 min-w-0 text-center"><div className="text-[9px] text-slate-500 truncate">{month.label}</div></div>)}
        </div>
        {!writeoffs.length && <p className="text-xs text-slate-500 mt-4">No expiry write-offs have been recorded yet. Current expired exposure is shown above; the historical chart will begin retaining losses when expired stock is reduced.</p>}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[760px]">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              <tr><th className="px-6 py-4">Product</th><th className="px-6 py-4 text-center">Expiry Date</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Central Stock</th><th className="px-6 py-4 text-right">Stock Cost Value</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredData.map(p => {
                const days = getDaysDiff(p.expiry_date);
                const stock = Math.max(0, Number(p.stock || 0));
                const stockValue = stock * Math.max(0, Number(p.cost_price || 0));
                return (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-slate-800 overflow-hidden"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div><div><p className="font-bold text-slate-200">{p.name}</p><p className="text-[10px] text-slate-500 font-mono">{p.sku || '—'}</p></div></div></td>
                    <td className="px-6 py-4 text-center font-mono text-slate-300">{new Date(`${p.expiry_date}T00:00:00`).toLocaleDateString('en-GB')}</td>
                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${days < 0 ? 'bg-rose-500 text-white' : days <= 7 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-emerald-500/10 text-emerald-400'}`}>{days < 0 ? 'EXPIRED' : days === 0 ? 'TODAY' : `In ${days} Days`}</span></td>
                    <td className="px-6 py-4 text-right font-bold text-slate-100">{stock}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-200">{money(stockValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
