'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductImage from '@/components/ProductImage';

type BatchRow = {
  id: string;
  product_id: string;
  batch_id: string | null;
  box_number: number | null;
  expiry_date: string;
  quantity: number;
  remaining_quantity: number;
  products: {
    id: string;
    name: string;
    sku: string | null;
    cost_price: number | null;
    image_url: string | null;
    stock: number | null;
    is_active: boolean | null;
    is_published: boolean | null;
    expiry_blocked: boolean | null;
  } | null;
};

type SummaryRow = {
  product_id: string;
  physical_stock: number;
  active_batch_count: number;
  blocked_remaining: number;
  fresh_remaining: number;
  sellable_stock: number;
  nearest_expiry: string | null;
  nearest_sellable_expiry: string | null;
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

type Filter = 'all' | 'blocked20' | 'expired' | '7days' | 'sellable';

const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);

const daysToExpiry = (dateStr: string) => {
  const expiry = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - now.getTime()) / 86_400_000);
};

export default function ExpiryClient() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [summary, setSummary] = useState<Map<string, SummaryRow>>(new Map());
  const [writeoffs, setWriteoffs] = useState<ExpiryWriteoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { void loadData(); }, []);

  const loadData = async () => {
    setLoading(true);

    const [batchResult, summaryResult, inventoryResult, writeoffResult] = await Promise.all([
      supabase
        .from('product_expiry')
        .select('id,product_id,batch_id,box_number,expiry_date,quantity,remaining_quantity,products(id,name,sku,cost_price,image_url,stock,is_active,is_published,expiry_blocked)')
        .gt('remaining_quantity', 0)
        .order('expiry_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('product_expiry_product_summary')
        .select('product_id,physical_stock,active_batch_count,blocked_remaining,fresh_remaining,sellable_stock,nearest_expiry,nearest_sellable_expiry'),
      supabase
        .from('central_inventory')
        .select('product_id,stock_quantity'),
      supabase
        .from('inventory_expiry_writeoffs')
        .select('id,product_id,quantity,unit_cost,total_cost,expiry_date,recorded_at')
        .order('recorded_at', { ascending: true }),
    ]);

    if (batchResult.error) console.error('[Expiry] Failed to load batch entries:', batchResult.error);
    if (summaryResult.error) console.error('[Expiry] Failed to load expiry availability:', summaryResult.error);
    if (inventoryResult.error) console.error('[Expiry] Failed to load central inventory:', inventoryResult.error);
    if (writeoffResult.error) console.error('[Expiry] Failed to load expiry losses:', writeoffResult.error);

    setBatches((batchResult.data || []) as unknown as BatchRow[]);

    const physicalStock = new Map<string, number>();
    for (const row of inventoryResult.data || []) {
      physicalStock.set(String(row.product_id), Number(row.stock_quantity || 0));
    }

    const nextSummary = new Map<string, SummaryRow>();
    for (const row of (summaryResult.data || []) as SummaryRow[]) {
      nextSummary.set(row.product_id, {
        ...row,
        physical_stock: physicalStock.get(String(row.product_id)) ?? Number(row.physical_stock || 0),
        active_batch_count: Number(row.active_batch_count || 0),
        blocked_remaining: Number(row.blocked_remaining || 0),
        fresh_remaining: Number(row.fresh_remaining || 0),
        sellable_stock: Number(row.sellable_stock || 0),
      });
    }
    setSummary(nextSummary);
    setWriteoffs((writeoffResult.data || []) as ExpiryWriteoff[]);
    setLoading(false);
  };

  const filtered = useMemo(() => batches.filter((row) => {
    const days = daysToExpiry(row.expiry_date);
    if (filter === 'blocked20') return days <= 20;
    if (filter === 'expired') return days < 0;
    if (filter === '7days') return days >= 0 && days <= 7;
    if (filter === 'sellable') return days > 20;
    return true;
  }), [batches, filter]);

  const stats = useMemo(() => {
    let blockedUnits = 0;
    let blockedValue = 0;
    let sellableUnits = 0;
    let expiredUnits = 0;
    let blockedRows = 0;

    for (const row of batches) {
      const remaining = Math.max(0, Number(row.remaining_quantity || 0));
      const cost = Math.max(0, Number(row.products?.cost_price || 0));
      const days = daysToExpiry(row.expiry_date);

      if (days <= 20) {
        blockedRows += 1;
        blockedUnits += remaining;
        blockedValue += remaining * cost;
      } else {
        sellableUnits += remaining;
      }
      if (days < 0) expiredUnits += remaining;
    }

    const historicalWriteoffValue = writeoffs.reduce(
      (sum, row) => sum + Math.max(0, Number(row.total_cost || 0)),
      0,
    );

    return { blockedUnits, blockedValue, sellableUnits, expiredUnits, blockedRows, historicalWriteoffValue };
  }, [batches, writeoffs]);

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

  if (loading) return <div className="p-8 text-center text-slate-400">Loading expiry batches...</div>;

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-6 pb-28">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Batch Expiry Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Each box / lot is tracked separately. A batch is blocked from sale at 20 days or less; later-dated batches of the same SKU stay sellable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'All batches'],
            ['blocked20', 'Blocked ≤20d'],
            ['expired', 'Expired'],
            ['7days', 'Next 7 days'],
            ['sellable', 'Sellable >20d'],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                filter === key
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-500 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-rose-300 font-black">Blocked batch rows</p>
          <p className="text-2xl font-black text-white mt-2">{stats.blockedRows}</p>
          <p className="text-xs text-slate-500 mt-1">Expiry at 20 days or less</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-rose-300 font-black">Blocked units</p>
          <p className="text-2xl font-black text-white mt-2">{stats.blockedUnits.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Excluded from storefront stock</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-amber-300 font-black">Blocked cost value</p>
          <p className="text-2xl font-black text-white mt-2">{money(stats.blockedValue)}</p>
          <p className="text-xs text-slate-500 mt-1">Remaining blocked stock at cost</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-emerald-300 font-black">Fresh tracked units</p>
          <p className="text-2xl font-black text-white mt-2">{stats.sellableUnits.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Batches outside the 20-day window</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-slate-400 font-black">Expired units</p>
          <p className="text-2xl font-black text-white mt-2">{stats.expiredUnits.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Still physically recorded</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
          <p className="text-[10px] uppercase tracking-[.18em] text-violet-300 font-black">Recorded losses</p>
          <p className="text-2xl font-black text-white mt-2">{money(stats.historicalWriteoffValue)}</p>
          <p className="text-xs text-slate-500 mt-1">Permanent expiry-loss history</p>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1100px]">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">Box / Lot</th>
                <th className="px-5 py-4 text-center">Expiry</th>
                <th className="px-5 py-4 text-center">Countdown</th>
                <th className="px-5 py-4 text-right">Batch Qty</th>
                <th className="px-5 py-4 text-right">Physical Stock</th>
                <th className="px-5 py-4 text-right">Sellable Stock</th>
                <th className="px-5 py-4 text-center">Store Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(row => {
                const days = daysToExpiry(row.expiry_date);
                const availability = summary.get(row.product_id);
                const blocked = days <= 20;
                const product = row.products;
                return (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-slate-800 overflow-hidden">
                          <ProductImage imageUrl={product?.image_url} size="thumb" alt={product?.name || 'Product'} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{product?.name || 'Unknown Product'}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{product?.sku || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-black text-slate-200">Box {row.box_number || '—'}</p>
                        <p className="font-mono text-[10px] text-slate-500">{row.batch_id || 'No lot code'}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center font-mono text-slate-300">
                      {new Date(`${row.expiry_date}T00:00:00`).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        days < 0
                          ? 'bg-rose-500 text-white'
                          : days <= 20
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      }`}>
                        {days < 0 ? `${Math.abs(days)}d expired` : days === 0 ? 'Today' : `${days} days`}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-slate-100">
                      {Math.max(0, Number(row.remaining_quantity || 0))}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-300">
                      {Number(availability?.physical_stock ?? product?.stock ?? 0)}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-cyan-300">
                      {Number(availability?.sellable_stock ?? 0)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        blocked
                          ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      }`}>
                        {blocked ? 'Blocked batch' : 'Sellable batch'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No expiry batches match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Recorded Expiry Losses · 12 Months</h2>
            <p className="text-xs text-slate-500 mt-1">Historical write-offs stay separate from live batch availability.</p>
          </div>
        </div>
        <div className="h-48 flex items-end gap-2 sm:gap-3 border-b border-slate-800 pb-1">
          {trend.map(month => {
            const height = month.value > 0 ? Math.max(8, (month.value / maxTrend) * 100) : 2;
            return (
              <div key={month.key} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group">
                <div className="text-[9px] text-slate-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {money(month.value)}
                </div>
                <div
                  title={`${month.label} ${month.year}: ${money(month.value)}`}
                  className="w-full max-w-10 rounded-t-md bg-violet-500/70 hover:bg-violet-400 transition-all"
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 sm:gap-3 pt-2">
          {trend.map(month => (
            <div key={month.key} className="flex-1 min-w-0 text-center">
              <div className="text-[9px] text-slate-500 truncate">{month.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
