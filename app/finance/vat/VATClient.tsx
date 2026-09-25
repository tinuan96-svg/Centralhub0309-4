'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

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
  recoverable_vat_amount: number | null;
  recoverable_confirmed: boolean;
  classification_status: string;
  exception_code: string | null;
  is_active: boolean;
};

const gbp = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number.isFinite(value) ? value : 0);
const n = (value: unknown) => Number(value || 0);
const amountOrDash = (value: number | null | undefined) => value == null ? '—' : gbp(Number(value));
const prettyException = (value: string | null) => value ? value.replaceAll('_', ' ') : '';

export default function VATClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [setting, setSetting] = useState<VatSetting | null>(null);
  const [periods, setPeriods] = useState<VatPeriod[]>([]);
  const [transactions, setTransactions] = useState<VatTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isAdmin } = useAuth();
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [draft, setDraft] = useState({ vat_number: '', is_vat_registered: false, accounting_basis: 'not_configured', prices_include_vat: true, notes: '' });

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
    setDraft({ vat_number: settingsResult.data?.vat_number || '', is_vat_registered: Boolean(settingsResult.data?.is_vat_registered), accounting_basis: settingsResult.data?.accounting_basis || 'not_configured', prices_include_vat: settingsResult.data?.prices_include_vat ?? true, notes: settingsResult.data?.notes || '' });
    setEditingSettings(false);
    setSettingsMessage('');
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

  const saveVatSettings = useCallback(async () => {
    if (!isAdmin || !storeId || savingSettings) return;
    setSettingsMessage('');
    const vatNumber = draft.vat_number.replace(/\s+/g, '').toUpperCase();
    if (draft.is_vat_registered && !/^(GB)?[0-9]{9}$/.test(vatNumber)) {
      setSettingsMessage('Enter the verified nine-digit UK VAT registration number before enabling VAT registration.');
      return;
    }
    if (draft.is_vat_registered && draft.accounting_basis === 'not_configured') {
      setSettingsMessage('Select the accounting basis confirmed by your accountant.');
      return;
    }
    setSavingSettings(true);
    try {
      const { error: saveError } = await supabase.from('vat_settings').upsert({
        store_id: storeId,
        vat_number: vatNumber || null,
        is_vat_registered: draft.is_vat_registered,
        accounting_basis: draft.accounting_basis,
        prices_include_vat: draft.prices_include_vat,
        notes: draft.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id' });
      if (saveError) throw saveError;
      await loadVat(storeId);
      setSettingsMessage('VAT settings saved for the selected store. This does not file or authorise a return with HMRC.');
    } catch (cause) {
      setSettingsMessage(cause instanceof Error ? cause.message : 'Could not save VAT settings.');
    } finally {
      setSavingSettings(false);
    }
  }, [draft, isAdmin, loadVat, savingSettings, storeId]);

  const stats = useMemo(() => {
    const known = transactions.filter(tx => tx.classification_status === 'known');
    const unresolved = transactions.filter(tx => tx.classification_status !== 'known');
    const outputVat = known.filter(tx => tx.direction === 'output').reduce((sum, tx) => sum + n(tx.vat_amount), 0);
    const inputVat = known.filter(tx => tx.direction === 'input').reduce((sum, tx) => sum + n(tx.recoverable_vat_amount), 0);
    const outputNet = known.filter(tx => tx.direction === 'output').reduce((sum, tx) => sum + n(tx.net_amount), 0);
    const inputNet = known.filter(tx => tx.direction === 'input').reduce((sum, tx) => sum + n(tx.net_amount), 0);
    const unresolvedGross = unresolved.reduce((sum, tx) => sum + n(tx.gross_amount), 0);
    return {
      outputVat,
      inputVat,
      position: outputVat - inputVat,
      outputNet,
      inputNet,
      unresolved: unresolved.length,
      unresolvedGross,
      total: transactions.length,
    };
  }, [transactions]);

  const selectedStore = stores.find(store => store.id === storeId);
  const configured = Boolean(setting?.is_vat_registered && setting.accounting_basis !== 'not_configured');

  return (
    <div className="max-w-[1500px] mx-auto p-6 space-y-6 pb-28">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[.22em] text-cyan-400 font-black">Finance & Control</div>
          <h1 className="text-2xl font-black text-white mt-1">VAT Control Centre</h1>
          <p className="text-sm text-slate-500 mt-1">VAT transaction classification, evidence status, period visibility and configuration by store.</p>
        </div>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white min-w-56">
          {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </div>

      <section aria-label="VAT filing feature status" className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-slate-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-200">In development</span>
          <span className="text-xs font-semibold text-cyan-300">Coming soon</span>
        </div>
        <h2 className="mt-3 text-xl sm:text-2xl font-black text-white">VAT Return Filing — we're working on it</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">We're building direct HMRC Making Tax Digital VAT return filing in CentralHub and hope to make it available soon. There is no confirmed launch date yet.</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">You can still review VAT transactions and configure company settings below. Preparing or submitting a VAT return to HMRC is not available here yet.</p>
      </section>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <div className={`rounded-2xl border p-5 ${configured ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-black uppercase tracking-widest ${configured ? 'text-emerald-300' : 'text-amber-300'}`}>{configured ? 'VAT configuration active' : 'VAT configuration not completed'}</p>
            <p className="text-sm text-slate-300 mt-1">{selectedStore?.name || 'Selected store'} · {setting?.accounting_basis || 'no settings record'}</p>
          </div>
          <div className="text-xs text-slate-500">VAT number: <span className="text-slate-300">{setting?.vat_number || 'Not set'}</span></div>
        </div>
        {!configured && <p className="text-xs text-slate-500 mt-3">CentralHub shows captured evidence but will not present a VAT return as ready while registration/accounting settings or classifications are unresolved.</p>}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-black text-slate-100">VAT return filing configuration</h2>
            <p className="text-xs text-slate-400 mt-1">Configure the selected company's VAT registration and accounting treatment. No live HMRC connection or submission is enabled.</p>
          </div>
          <button type="button" disabled={!isAdmin || loading} onClick={() => { setEditingSettings(value => !value); setSettingsMessage(''); }} className="rounded-xl border border-cyan-500/40 px-4 py-2.5 text-xs font-black text-cyan-300 disabled:opacity-50">
            {editingSettings ? 'Close configuration' : 'Configure VAT'}
          </button>
        </div>
        {editingSettings && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800 pt-4">
            <label className="flex items-center gap-3 text-sm text-slate-200 md:col-span-2">
              <input type="checkbox" checked={draft.is_vat_registered} onChange={e => setDraft(previous => ({ ...previous, is_vat_registered: e.target.checked }))} />
              This legal company is registered for UK VAT (verify against HMRC registration)
            </label>
            <label className="text-xs text-slate-400">VAT registration number
              <input value={draft.vat_number} onChange={e => setDraft(previous => ({ ...previous, vat_number: e.target.value }))} placeholder="9-digit VAT number" maxLength={13} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">VAT accounting basis
              <select value={draft.accounting_basis} onChange={e => setDraft(previous => ({ ...previous, accounting_basis: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white">
                <option value="not_configured">Not confirmed</option>
                <option value="invoice">Invoice / accrual basis</option>
                <option value="cash">Cash Accounting Scheme (if eligible and in use)</option>
              </select>
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-200 md:col-span-2">
              <input type="checkbox" checked={draft.prices_include_vat} onChange={e => setDraft(previous => ({ ...previous, prices_include_vat: e.target.checked }))} />
              Store's displayed prices are VAT-inclusive
            </label>
            <label className="text-xs text-slate-400 md:col-span-2">Accounting notes (no passwords or HMRC credentials)
              <textarea value={draft.notes} onChange={e => setDraft(previous => ({ ...previous, notes: e.target.value }))} rows={2} maxLength={2000} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" />
            </label>
            <p className="text-xs leading-5 text-amber-200 md:col-span-2">Do not select an accounting scheme, VAT registration status, or a universal shipping VAT rate based on an assumption. Company identity, product tax codes, invoices, refunds, imports and unresolved transactions must be checked before preparing a return. This screen does not connect to HMRC.</p>
            <button type="button" disabled={!isAdmin || savingSettings} onClick={() => void saveVatSettings()} className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{savingSettings ? 'Saving…' : 'Save company VAT settings'}</button>
          </div>
        )}
        {settingsMessage && <p role="status" className="text-sm text-cyan-200">{settingsMessage}</p>}
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">HMRC MTD: Not connected</span><span className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">Return submission: Disabled</span><span className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300">Periods: Import from HMRC once authorised</span></div>
      </section>

      {stats.unresolved > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          <span className="font-black">Unresolved VAT is not treated as £0.00.</span> {stats.unresolved.toLocaleString()} transaction{stats.unresolved === 1 ? '' : 's'} with {gbp(stats.unresolvedGross)} gross value still require classification or configuration. Missing net/VAT values are shown as “—” below.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <Kpi label="Known output VAT" value={gbp(stats.outputVat)} />
        <Kpi label="Known recoverable input VAT" value={gbp(stats.inputVat)} />
        <Kpi label="Known VAT position" value={gbp(stats.position)} emphasis />
        <Kpi label="Unresolved / review" value={stats.unresolved.toLocaleString()} warning={stats.unresolved > 0} />
        <Kpi label="Unresolved gross value" value={gbp(stats.unresolvedGross)} warning={stats.unresolved > 0} />
        <Kpi label="Loaded transactions" value={stats.total.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div><h2 className="font-black text-slate-100">Recent VAT Transactions</h2><p className="text-xs text-slate-500 mt-1">Actual captured values. Unresolved net/VAT fields stay blank until classification is supported.</p></div>
            {loading && <span className="text-xs text-cyan-400">Refreshing…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">Tax point</th><th className="text-left px-5 py-3">Source</th><th className="text-left px-5 py-3">Description</th><th className="text-left px-5 py-3">Direction</th><th className="text-right px-5 py-3">Gross</th><th className="text-right px-5 py-3">Net</th><th className="text-right px-5 py-3">VAT</th><th className="text-left px-5 py-3">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.slice(0, 100).map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/20">
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{new Date(`${tx.tax_point}T00:00:00`).toLocaleDateString('en-GB')}</td>
                    <td className="px-5 py-3 text-slate-400">{tx.source_type}</td>
                    <td className="px-5 py-3 text-slate-200 max-w-[320px] truncate">{tx.description || '—'}</td>
                    <td className="px-5 py-3"><span className={`text-[10px] font-black uppercase ${tx.direction === 'output' ? 'text-cyan-300' : 'text-violet-300'}`}>{tx.direction}</span></td>
                    <td className="px-5 py-3 text-right text-slate-300">{amountOrDash(tx.gross_amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{amountOrDash(tx.net_amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-200 font-bold">{tx.direction === 'input' ? amountOrDash(tx.recoverable_confirmed ? tx.recoverable_vat_amount : null) : amountOrDash(tx.vat_amount)}</td>
                    <td className="px-5 py-3"><Status value={tx.classification_status} />{tx.exception_code && <div className="mt-1 max-w-[220px] text-[10px] text-amber-300/80">{prettyException(tx.exception_code)}</div>}</td>
                  </tr>
                ))}
                {!loading && transactions.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-600">No VAT transactions for this store yet.</td></tr>}
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
          <Info label="Gross awaiting classification" value={gbp(stats.unresolvedGross)} />
          <div className="pt-3 border-t border-slate-800 text-[11px] leading-5 text-slate-600">This is an operational control screen. CentralHub does not mark anything as filed with HMRC unless a real filing workflow and period record say so.</div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800"><h2 className="font-black text-slate-100">VAT Periods</h2><p className="text-xs text-slate-500 mt-1">Calculated, locked or filed period records already stored in CentralHub.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-3 text-left">Period</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Sales net</th><th className="px-5 py-3 text-right">Output VAT</th><th className="px-5 py-3 text-right">Input VAT</th><th className="px-5 py-3 text-right">VAT position</th><th className="px-5 py-3 text-right">Unresolved</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">
              {periods.map(period => <tr key={period.id}><td className="px-5 py-3 text-slate-300">{new Date(`${period.period_start}T00:00:00`).toLocaleDateString('en-GB')} – {new Date(`${period.period_end}T00:00:00`).toLocaleDateString('en-GB')}</td><td className="px-5 py-3"><Status value={period.status} /></td><td className="px-5 py-3 text-right text-slate-400">{gbp(n(period.sales_net))}</td><td className="px-5 py-3 text-right text-slate-300">{gbp(n(period.output_vat))}</td><td className="px-5 py-3 text-right text-slate-300">{gbp(n(period.recoverable_input_vat))}</td><td className="px-5 py-3 text-right font-bold text-white">{gbp(n(period.vat_position))}</td><td className="px-5 py-3 text-right text-amber-300">{period.unresolved_count}</td></tr>)}
              {!loading && periods.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-600">No VAT periods have been calculated for this store yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, emphasis = false, warning = false }: { label: string; value: string; emphasis?: boolean; warning?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${warning ? 'border-amber-500/20 bg-amber-500/5' : emphasis ? 'border-cyan-500/20 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/50'}`}><p className="text-[10px] uppercase tracking-[.16em] text-slate-500 font-black">{label}</p><p className={`text-xl font-black mt-2 ${warning ? 'text-amber-300' : 'text-white'}`}>{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-xs text-slate-500">{label}</span><span className="text-xs font-bold text-slate-200 text-right">{value}</span></div>;
}

function Status({ value }: { value: string }) {
  const good = ['known', 'filed', 'locked', 'calculated', 'ready'].includes(value);
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${good ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>{value.replaceAll('_', ' ')}</span>;
}
