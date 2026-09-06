'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Store = { id: string; name: string; slug: string | null };
type VatSetting = {
  store_id: string;
  vat_number: string | null;
  is_vat_registered: boolean;
  accounting_basis: string;
  prices_include_vat: boolean;
  shipping_vat_rate: number | null;
  notes: string | null;
  updated_at: string;
};
type VatPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  sales_net: number;
  output_vat: number;
  purchases_net: number;
  recoverable_input_vat: number;
  adjustments: number;
  vat_position: number;
  unresolved_count: number;
  calculated_at: string | null;
  filed_at: string | null;
};
type VatTransaction = {
  id: string;
  source_type: string;
  direction: string;
  tax_point: string;
  description: string | null;
  net_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
  recoverable_vat_amount: number;
  recoverable_confirmed: boolean;
  classification_status: string;
  exception_code: string | null;
  is_active: boolean;
};

const gbp = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number.isFinite(value) ? value : 0);
const n = (value: unknown) => Number(value || 0);

export default function VATClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [setting, setSetting] = useState<VatSetting | null>(null);
  const [periods, setPeriods] = useState<VatPeriod[]>([]);
  const [transactions, setTransactions] = useState<VatTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStores = useCallback(async () => {
    const { data, error: storeError } = await supabase.from('stores').select('id,name,slug').order('name');
    if (storeError) throw storeError;
    const next = (data || []) as Store[];
    setStores(next);
    setStoreId(current => current || next[0]?.id || '');
  }, []);

  const loadVat = useCallback(async (selectedStoreId: string) => {
    if (!selectedStoreId) return;
    setLoading(true);
    setError('');
    const [settingsResult, periodsResult, txResult] = await Promise.all([
      supabase.from('vat_settings').select('store_id,vat_number,is_vat_registered,accounting_basis,prices_include_vat,shipping_vat_rate,notes,updated_at').eq('store_id', selectedStoreId).maybeSingle(),
      supabase.from('vat_periods').select('id,period_start,period_end,status,sales_net,output_vat,purchases_net,recoverable_input_vat,adjustments,vat_position,unresolved_count,calculated_at,filed_at').eq('store_id', selectedStoreId).order('period_end', { ascending: false }).limit(12),
      supabase.from('vat_transactions').select('id,source_type,direction,tax_point,description,net_amount,vat_rate,vat_amount,gross_amount,recoverable_vat_amount,recoverable_confirmed,classification_status,exception_code,is_active').eq('store_id', selectedStoreId).eq('is_active', true).order('tax_point', { ascending: false }).limit(500),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (periodsResult.error) throw periodsResult.error;
    if (txResult.error) throw txResult.error;

    setSetting((settingsResult.data || null) as VatSetting | null);
    setPeriods((periodsResult.data || []) as VatPeriod[]);
    setTransactions((txResult.data || []) as VatTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStores().catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [loadStores]);

  useEffect(() => {
    if (storeId) loadVat(storeId).catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [storeId, loadVat]);

  const stats = useMemo(() => {
    const known = transactions.filter(tx => tx.classification_status === 'known');
    const unresolved = transactions.filter(tx => tx.classification_status !== 'known');
    const outputVat = known.filter(tx => tx.direction === 'output').reduce((sum, tx) => sum + n(tx.vat_amount), 0);
    const inputVat = known.filter(tx => tx.direction === 'input').reduce((sum, tx) => sum + n(tx.recoverable_vat_amount), 0);
    const outputNet = known.filter(tx => tx.direction === 'output').reduce((sum, tx) => sum + n(tx.net_amount), 0);
    const inputNet = known.filter(tx => tx.direction === 'input').reduce((sum, tx) => sum + n(tx.net_amount), 0);
    return { outputVat, inputVat, position: outputVat - inputVat, outputNet, inputNet, unresolved: unresolved.length, total: transactions.length };
  }, [transactions]);

  const selectedStore = stores.find(store => store.id === storeId);
  const configured = Boolean(setting?.is_vat_registered && setting.accounting_basis !== 'not_configured');

  return (
    <div className="max-w-[1500px] mx-auto p-6 space-y-6 pb-28">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[.22em] text-cyan-400 font-black">Finance & Control</div>
          <h1 className="text-2xl font-black text-white mt-1">VAT Control Centre</h1>
          <p className="text-sm text-slate-500 mt-1">VAT transaction classification, period visibility and configuration status by store.</p>
        </div>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white min-w-56">
          {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <div className={`rounded-2xl border p-5 ${configured ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-black uppercase tracking-widest ${configured ? 'text-emerald-300' : 'text-amber-300'}`}>{configured ? 'VAT configuration active' : 'VAT configuration not completed'}</p>
            <p className="text-sm text-slate-300 mt-1">{selectedStore?.name || 'Selected store'} · {setting?.accounting_basis || 'no settings record'}</p>
          </div>
          <div className="text-xs text-slate-500">VAT number: <span className="text-slate-300">{setting?.vat_number || 'Not set'}</span></div>
        </div>
        {!configured && <p className="text-xs text-slate-500 mt-3">CentralHub is showing the data already captured, but it will not pretend a VAT return is ready while registration/accounting settings and unresolved classifications are incomplete.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Kpi label="Known output VAT" value={gbp(stats.outputVat)} />
        <Kpi label="Known recoverable input VAT" value={gbp(stats.inputVat)} />
        <Kpi label="Known VAT position" value={gbp(stats.position)} emphasis />
        <Kpi label="Unresolved / review" value={stats.unresolved.toLocaleString()} warning={stats.unresolved > 0} />
        <Kpi label="Loaded transactions" value={stats.total.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div><h2 className="font-black text-slate-100">Recent VAT Transactions</h2><p className="text-xs text-slate-500 mt-1">Latest active VAT records for this store.</p></div>
            {loading && <span className="text-xs text-cyan-400">Refreshing…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="text-left px-5 py-3">Tax point</th><th className="text-left px-5 py-3">Source</th><th className="text-left px-5 py-3">Description</th><th className="text-left px-5 py-3">Direction</th><th className="text-right px-5 py-3">Net</th><th className="text-right px-5 py-3">VAT</th><th className="text-left px-5 py-3">Classification</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.slice(0, 100).map(tx => <tr key={tx.id} className="hover:bg-slate-800/20"><td className="px-5 py-3 text-slate-400 whitespace-nowrap">{new Date(`${tx.tax_point}T00:00:00`).toLocaleDateString('en-GB')}</td><td className="px-5 py-3 text-slate-400">{tx.source_type}</td><td className="px-5 py-3 text-slate-200 max-w-[320px] truncate">{tx.description || '—'}</td><td className="px-5 py-3"><span className={`text-[10px] font-black uppercase ${tx.direction === 'output' ? 'text-cyan-300' : 'text-violet-300'}`}>{tx.direction}</span></td><td className="px-5 py-3 text-right text-slate-300">{gbp(n(tx.net_amount))}</td><td className="px-5 py-3 text-right text-slate-200 font-bold">{gbp(tx.direction === 'input' ? n(tx.recoverable_vat_amount) : n(tx.vat_amount))}</td><td className="px-5 py-3"><Status value={tx.classification_status} /></td></tr>)}
                {!loading && transactions.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-600">No VAT transactions for this store yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5">
          <div><h2 className="font-black text-slate-100">VAT Settings Snapshot</h2><p className="text-xs text-slate-500 mt-1">Stored configuration for {selectedStore?.name || 'this store'}.</p></div>
          <Info label="Registered" value={setting?.is_vat_registered ? 'Yes' : 'No'} />
          <Info label="Accounting basis" value={setting?.accounting_basis || 'Not configured'} />
          <Info label="Prices include VAT" value={setting?.prices_include_vat ? 'Yes' : 'No'} />
          <Info label="Shipping VAT rate" value={setting?.shipping_vat_rate == null ? 'Not set' : `${setting.shipping_vat_rate}%`} />
          <Info label="Known sales net" value={gbp(stats.outputNet)} />
          <Info label="Known purchases net" value={gbp(stats.inputNet)} />
          <div className="pt-3 border-t border-slate-800 text-[11px] leading-5 text-slate-600">This page is an operational calculation/control screen. It does not mark anything as filed with HMRC unless a real filing workflow and period record say so.</div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800"><h2 className="font-black text-slate-100">VAT Periods</h2><p className="text-xs text-slate-500 mt-1">Calculated/locked/filed period records already stored in CentralHub.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-3 text-left">Period</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Sales net</th><th className="px-5 py-3 text-right">Output VAT</th><th className="px-5 py-3 text-right">Input VAT</th><th className="px-5 py-3 text-right">VAT position</th><th className="px-5 py-3 text-right">Unresolved</th></tr></thead><tbody className="divide-y divide-slate-800/60">
            {periods.map(period => <tr key={period.id}><td className="px-5 py-3 text-slate-300">{new Date(`${period.period_start}T00:00:00`).toLocaleDateString('en-GB')} – {new Date(`${period.period_end}T00:00:00`).toLocaleDateString('en-GB')}</td><td className="px-5 py-3"><Status value={period.status} /></td><td className="px-5 py-3 text-right text-slate-400">{gbp(n(period.sales_net))}</td><td className="px-5 py-3 text-right text-slate-300">{gbp(n(period.output_vat))}</td><td className="px-5 py-3 text-right text-slate-300">{gbp(n(period.recoverable_input_vat))}</td><td className="px-5 py-3 text-right font-bold text-white">{gbp(n(period.vat_position))}</td><td className="px-5 py-3 text-right text-amber-300">{period.unresolved_count}</td></tr>)}
            {!loading && periods.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-600">No VAT periods have been calculated for this store yet.</td></tr>}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, emphasis = false, warning = false }: { label: string; value: string; emphasis?: boolean; warning?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${warning ? 'border-amber-500/20 bg-amber-500/5' : emphasis ? 'border-cyan-500/20 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/50'}`}><p className="text-[10px] uppercase tracking-[.16em] text-slate-500 font-black">{label}</p><p className={`text-xl font-black mt-2 ${warning ? 'text-amber-300' : 'text-white'}`}>{value}</p></div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-xs text-slate-500">{label}</span><span className="text-xs font-bold text-slate-200 text-right">{value}</span></div>; }
function Status({ value }: { value: string }) {
  const good = ['known', 'filed', 'locked', 'calculated', 'ready'].includes(value);
  const bad = ['unresolved', 'failed'].includes(value);
  return <span className={`inline-flex px-2 py-1 rounded-lg text-[10px] font-black uppercase ${good ? 'bg-emerald-500/10 text-emerald-300' : bad ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>{value.replaceAll('_', ' ')}</span>;
}
