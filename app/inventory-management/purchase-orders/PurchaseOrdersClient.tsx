'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Recommendation = {
  product_id: string;
  product_name: string;
  sku: string | null;
  gtin: string | null;
  stock_quantity: number;
  available_quantity: number;
  units_sold_period: number;
  expected_daily_units: number;
  days_of_cover: number | null;
  incoming_quantity: number;
  recommended_quantity: number;
  best_supplier_id: string | null;
  best_supplier_name: string | null;
  best_unit_cost: number | null;
  supplier_count: number;
  recommendation_reason: string;
};

type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  items: Recommendation[];
};

export default function PurchaseOrdersClient() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const [r, o] = await Promise.all([
      supabase.rpc('get_purchase_recommendations', {
        p_days: 30,
        p_target_cover_days: 14,
      }),
      supabase
        .from('purchase_orders')
        .select('id,po_number,status,order_date,total_cost,suppliers(name)')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (r.error) setError(r.error.message);
    setRecs((r.data || []) as Recommendation[]);
    setOrders(o.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = Object.values(
    recs
      .filter((r) => r.recommended_quantity > 0 && r.best_supplier_id)
      .reduce<Record<string, SupplierGroup>>((acc, r) => {
        const supplierId = r.best_supplier_id as string;
        if (!acc[supplierId]) {
          acc[supplierId] = {
            supplier_id: supplierId,
            supplier_name: r.best_supplier_name || 'Supplier',
            items: [],
          };
        }
        acc[supplierId].items.push(r);
        return acc;
      }, {})
  );

  const createPO = async (g: SupplierGroup) => {
    const items = g.items
      .map((r) => ({
        product_id: r.product_id,
        quantity: selected[r.product_id] ?? r.recommended_quantity,
      }))
      .filter((x) => x.quantity > 0);

    if (!items.length) return;

    if (!confirm(`Create PO for ${g.supplier_name} with ${items.length} products?`)) return;

    setCreating(true);
    const { data, error } = await supabase.rpc('create_purchase_order_from_items', {
      p_supplier_id: g.supplier_id,
      p_items: items,
      p_source_type: 'sales_flow',
    });
    setCreating(false);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
    alert(`PO created successfully. Reference: ${data}`);
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-500">
        Calculating replenishment from sales flow and supplier offers…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Purchase Control Centre
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sales-flow demand → supplier comparison → PO → receiving scan
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/inventory-management/grn/new"
            className="px-5 py-3 rounded-xl bg-slate-800 text-white font-bold"
          >
            Receive / Scan
          </Link>
          <button
            onClick={load}
            className="px-5 py-3 rounded-xl bg-cyan-600 text-white font-bold"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {grouped.map((g) => (
          <div
            key={g.supplier_id}
            className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden"
          >
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">{g.supplier_name}</h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Best current normalized offer · {g.items.length} products
                </p>
              </div>
              <button
                disabled={creating}
                onClick={() => createPO(g)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase"
              >
                Generate PO
              </button>
            </div>

            <div className="divide-y divide-slate-800">
              {g.items.map((r) => (
                <div key={r.product_id} className="p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="font-bold text-white">{r.product_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        SKU {r.sku || '—'} · GTIN {r.gtin || '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-cyan-400">
                        {formatCurrency(r.best_unit_cost || 0)}/unit
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {r.supplier_count} supplier(s)
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                    <div className="bg-slate-800/50 rounded-lg p-2">
                      <span className="text-slate-500 block">Available</span>
                      <b className="text-white">{r.available_quantity}</b>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2">
                      <span className="text-slate-500 block">Avg/day</span>
                      <b className="text-white">{r.expected_daily_units}</b>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2">
                      <span className="text-slate-500 block">Cover</span>
                      <b className="text-white">
                        {r.days_of_cover == null ? '—' : `${r.days_of_cover}d`}
                      </b>
                    </div>
                    <div className="bg-cyan-500/10 rounded-lg p-2">
                      <span className="text-cyan-500 block">Recommended</span>
                      <input
                        type="number"
                        min={0}
                        value={selected[r.product_id] ?? r.recommended_quantity}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [r.product_id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full bg-transparent text-cyan-300 font-black outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2">{r.recommendation_reason}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {grouped.length === 0 && (
        <div className="p-12 rounded-3xl border border-slate-800 bg-slate-900/50 text-center text-slate-500">
          No products currently require replenishment with a valid supplier offer.
        </div>
      )}

      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="font-black text-white uppercase tracking-widest text-sm">
            Recent Purchase Orders
          </h2>
        </div>
        <div className="divide-y divide-slate-800">
          {orders.map((o) => (
            <div key={o.id} className="p-4 flex justify-between items-center">
              <div>
                <b className="text-white">{o.po_number}</b>
                <span className="ml-3 text-slate-500">{o.suppliers?.name || 'Supplier'}</span>
              </div>
              <div className="flex gap-5 items-center">
                <span className="text-cyan-400 font-bold">{formatCurrency(o.total_cost)}</span>
                <span className="text-[10px] uppercase text-slate-500">{o.status}</span>
                <Link
                  href={`/inventory-management/grn/new?po=${o.id}`}
                  className="text-cyan-400 text-xs font-bold"
                >
                  Receive →
                </Link>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="p-8 text-center text-slate-600">No purchase orders yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
