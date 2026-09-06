'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Tx = {
  id: string;
  bank_account_id?: string | null;
  transaction_date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  balance?: number | null;
  reference?: string | null;
  merchant?: string | null;
  transaction_category?: string | null;
  accounting_category?: string | null;
  classification_status?: string | null;
  reconciliation_status?: string | null;
  is_reconciled?: boolean | null;
  reconciliation_notes?: string | null;
};

type Account = { id: string; bank_name?: string | null; account_name?: string | null; account_number?: string | null };

const categories = [
  ['sales_income', 'Sales income', 'revenue'],
  ['supplier_payment', 'Supplier payment / COGS', 'cogs'],
  ['operating_expense', 'Operating expense', 'operating_expense'],
  ['tax', 'Tax', 'tax'],
  ['refund', 'Refund', 'other'],
  ['transfer', 'Bank transfer', 'transfer'],
  ['savings_allocation', 'Savings allocation / earmarked funds', 'transfer'],
  ['financing', 'Finance / loan', 'finance_cost'],
  ['other_income', 'Other income', 'revenue'],
  ['other_expense', 'Other expense', 'other'],
  ['unknown', 'Needs review', 'other'],
] as const;

const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const matchKeys = (tx: Tx) => Array.from(new Set([normalize(tx.description), normalize(tx.merchant), normalize(tx.reference)].filter(Boolean)));
const reconciled = (tx: Tx) => Boolean(tx.is_reconciled) || tx.reconciliation_status === 'reconciled';

export default function FinanceTransactionsReconciliationClient() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [direction, setDirection] = useState('all');
  const [classification, setClassification] = useState('all');
  const [accounting, setAccounting] = useState('all');
  const [reconFilter, setReconFilter] = useState(searchParams.get('status') === 'reconciled' ? 'reconciled' : 'unreconciled');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'name' | 'balance'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [pending, setPending] = useState<{ sourceId: string; category: string; accounting: string; matches: Tx[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [txResult, accountResult] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
      supabase.from('store_bank_accounts').select('id,bank_name,account_name,account_number').order('bank_name', { ascending: true }),
    ]);
    if (txResult.error) setError(txResult.error.message);
    setRows((txResult.data || []) as Tx[]);
    setAccounts((accountResult.data || []) as Account[]);
    setSelected(new Set());
    setPending(null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const accountName = (id?: string | null) => {
    const a = accounts.find(x => x.id === id);
    return a ? `${a.bank_name || 'Bank'}${a.account_name ? ` · ${a.account_name}` : ''}` : 'Unknown account';
  };

  const filtered = useMemo(() => {
    const q = normalize(search);
    const min = minAmount === '' ? null : Number(minAmount);
    const max = maxAmount === '' ? null : Number(maxAmount);
    const result = rows.filter(tx => {
      const haystack = normalize([tx.description, tx.merchant, tx.reference, tx.id, accountName(tx.bank_account_id)].join(' '));
      if (q && !haystack.includes(q)) return false;
      if (accountFilter !== 'all' && tx.bank_account_id !== accountFilter) return false;
      if (direction !== 'all' && tx.type !== direction) return false;
      if (classification !== 'all' && (tx.transaction_category || 'unknown') !== classification) return false;
      if (accounting !== 'all' && (tx.accounting_category || 'unassigned') !== accounting) return false;
      if (reconFilter === 'unreconciled' && reconciled(tx)) return false;
      if (reconFilter === 'reconciled' && !reconciled(tx)) return false;
      const date = tx.transaction_date?.slice(0, 10) || '';
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      const amount = Math.abs(Number(tx.amount || 0));
      if (min !== null && amount < min) return false;
      if (max !== null && amount > max) return false;
      return true;
    });
    return result.sort((a, b) => {
      let av: string | number = a.transaction_date || '';
      let bv: string | number = b.transaction_date || '';
      if (sortBy === 'amount') { av = Math.abs(Number(a.amount || 0)); bv = Math.abs(Number(b.amount || 0)); }
      if (sortBy === 'balance') { av = Number(a.balance || 0); bv = Number(b.balance || 0); }
      if (sortBy === 'name') { av = normalize(a.description || a.merchant); bv = normalize(b.description || b.merchant); }
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, accountFilter, direction, classification, accounting, reconFilter, fromDate, toDate, minAmount, maxAmount, sortBy, sortDir, accounts]);

  const unreconciledCount = rows.filter(x => !reconciled(x)).length;
  const reconciledCount = rows.length - unreconciledCount;
  const filteredUnreconciled = filtered.filter(x => !reconciled(x));
  const selectedVisible = filtered.filter(x => selected.has(x.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every(x => selected.has(x.id));

  const clearFilters = () => {
    setSearch(''); setAccountFilter('all'); setDirection('all'); setClassification('all'); setAccounting('all'); setReconFilter('unreconciled'); setFromDate(''); setToDate(''); setMinAmount(''); setMaxAmount(''); setSortBy('date'); setSortDir('desc'); setSelected(new Set());
  };

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleVisible = () => setSelected(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) filtered.forEach(x => next.delete(x.id)); else filtered.forEach(x => next.add(x.id));
    return next;
  });

  const reconcileIds = async (ids: string[]) => {
    if (!ids.length) return;
    setBulkSaving(true); setError(null);
    const results = await Promise.all(ids.map(id => supabase.rpc('reconcile_bank_transaction', { p_transaction_id: id, p_notes: 'Reconciled from Bank Reconciliation centre' })));
    const failed = results.find(r => r.error)?.error;
    if (failed) { setError(failed.message); setBulkSaving(false); return; }
    const idSet = new Set(ids);
    setRows(prev => prev.map(x => idSet.has(x.id) ? { ...x, is_reconciled: true, reconciliation_status: 'reconciled', reconciliation_notes: 'Reconciled from Bank Reconciliation centre' } : x));
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    setBulkSaving(false);
  };

  const reconcileOne = async (tx: Tx) => { setSaving(tx.id); await reconcileIds([tx.id]); setSaving(null); };

  const prepareClassification = (tx: Tx, category: string, acct: string) => {
    if (category === 'unknown') return;
    const sourceKeys = matchKeys(tx);
    const matches = rows.filter(x => x.id !== tx.id && !reconciled(x) && (x.classification_status === 'needs_review' || !x.transaction_category || x.transaction_category === 'unknown') && matchKeys(x).some(k => sourceKeys.includes(k)));
    setPending({ sourceId: tx.id, category, accounting: acct, matches });
  };

  const classifyIds = async (ids: string[], category: string, acct: string) => {
    setBulkSaving(true); setError(null);
    const results = await Promise.all(ids.map(id => supabase.rpc('classify_financial_transaction', { p_transaction_id: id, p_transaction_category: category, p_accounting_category: acct, p_notes: null })));
    const failed = results.find(r => r.error)?.error;
    if (failed) { setError(failed.message); setBulkSaving(false); return false; }
    const idSet = new Set(ids);
    setRows(prev => prev.map(x => idSet.has(x.id) ? { ...x, transaction_category: category === 'savings_allocation' ? 'transfer' : category, accounting_category: acct, classification_status: 'classified' } : x));
    setBulkSaving(false); return true;
  };

  const applyPending = async () => {
    if (!pending) return;
    const ok = await classifyIds([pending.sourceId, ...pending.matches.map(x => x.id)], pending.category, pending.accounting);
    if (ok) setPending(null);
  };

  const uniqueAccounting = useMemo(() => Array.from(new Set(rows.map(x => x.accounting_category).filter(Boolean))).sort(), [rows]);
  const uniqueClassifications = categories.filter(c => rows.some(x => (x.transaction_category || 'unknown') === c[0]));

  return <main className="p-4 sm:p-6 space-y-5 max-w-[1800px] mx-auto">
    <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
      <div><p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p><h1 className="text-2xl sm:text-3xl font-black text-white">Bank Reconciliation</h1><p className="text-sm text-slate-500 mt-1">Find, verify and reconcile bank movements quickly. Classification and reconciliation remain separate.</p></div>
      <div className="flex gap-2"><Link href="/finance" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Finance</Link><button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Refresh</button></div>
    </header>

    {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}

    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button onClick={() => setReconFilter('unreconciled')} className={`text-left bg-slate-900 border rounded-2xl p-4 ${reconFilter === 'unreconciled' ? 'border-amber-400/50' : 'border-slate-800'}`}><p className="text-[10px] text-slate-500 uppercase font-black">Left to reconcile</p><p className="text-2xl font-black text-amber-300">{unreconciledCount}</p></button>
      <button onClick={() => setReconFilter('reconciled')} className={`text-left bg-slate-900 border rounded-2xl p-4 ${reconFilter === 'reconciled' ? 'border-emerald-400/50' : 'border-slate-800'}`}><p className="text-[10px] text-slate-500 uppercase font-black">Reconciled</p><p className="text-2xl font-black text-emerald-300">{reconciledCount}</p></button>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Filtered movements</p><p className="text-2xl font-black text-cyan-300">{filtered.length}</p></div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Filtered value</p><p className="text-2xl font-black text-white">{formatCurrency(filtered.reduce((a, x) => a + Math.abs(Number(x.amount || 0)), 0))}</p></div>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      <div className="flex flex-col lg:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, merchant, reference, account or transaction ID…" className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none" />
        <select value={reconFilter} onChange={e => setReconFilter(e.target.value)} className="filter"><option value="unreconciled">Unreconciled only</option><option value="all">All transactions</option><option value="reconciled">Reconciled only</option></select>
        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="filter"><option value="all">All bank accounts</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` · ${a.account_name}` : ''}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <select value={direction} onChange={e => setDirection(e.target.value)} className="filter"><option value="all">Any direction</option><option value="credit">Credits / income</option><option value="debit">Debits / outflow</option></select>
        <select value={classification} onChange={e => setClassification(e.target.value)} className="filter"><option value="all">All classifications</option>{uniqueClassifications.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}<option value="unknown">Needs review / unclassified</option></select>
        <select value={accounting} onChange={e => setAccounting(e.target.value)} className="filter"><option value="all">All accounting buckets</option><option value="unassigned">Unassigned</option>{uniqueAccounting.map(a => <option key={a as string} value={a as string}>{a as string}</option>)}</select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="From date" className="filter" />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="To date" className="filter" />
        <div className="flex gap-1"><input inputMode="decimal" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Min £" className="filter w-1/2" /><input inputMode="decimal" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Max £" className="filter w-1/2" /></div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Sort</span>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="filter"><option value="date">Transaction date</option><option value="amount">Amount</option><option value="name">Description / name</option><option value="balance">Running balance</option></select>
        <button onClick={() => setSortDir(x => x === 'asc' ? 'desc' : 'asc')} className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white">{sortDir === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
        <button onClick={clearFilters} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300">Clear filters</button>
        <span className="ml-auto text-[10px] text-slate-500">Showing {filtered.length} of {rows.length}</span>
      </div>
    </section>

    {pending && <section className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3"><div className="flex flex-col lg:flex-row lg:justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Repeated transaction match</p><h2 className="text-lg font-black text-white">Apply the selected classification to {pending.matches.length} matching unreconciled transaction{pending.matches.length === 1 ? '' : 's'}?</h2><p className="text-xs text-slate-400">Matches use normalized description, merchant or reference. Nothing is saved until you confirm.</p></div><div className="flex gap-2"><button disabled={bulkSaving} onClick={async () => { const ok = await classifyIds([pending.sourceId], pending.category, pending.accounting); if (ok) setPending(null); }} className="btn-secondary">Selected only</button><button disabled={bulkSaving} onClick={applyPending} className="btn-primary">{bulkSaving ? 'Applying…' : `Apply to ${pending.matches.length + 1}`}</button><button onClick={() => setPending(null)} className="btn-secondary">Cancel</button></div></div><div className="max-h-40 overflow-auto grid gap-1">{pending.matches.map(tx => <div key={tx.id} className="flex justify-between bg-slate-950/60 rounded-lg px-3 py-2 text-xs"><span className="text-white">{tx.description}</span><span className={tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Number(tx.amount || 0))}</span></div>)}</div></section>}

    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-800 bg-slate-950/40"><button onClick={toggleVisible} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[9px] font-black uppercase tracking-widest text-white">{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button><span className="text-xs text-slate-400">{selected.size} selected</span>{selectedVisible.length > 0 && <><button disabled={bulkSaving} onClick={() => { if (confirm(`Reconcile ${selectedVisible.length} selected transaction(s)?`)) reconcileIds(selectedVisible.map(x => x.id)); }} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest">{bulkSaving ? 'Working…' : `Reconcile selected (${selectedVisible.length})`}</button><button onClick={() => setSelected(new Set())} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[9px] font-black uppercase tracking-widest text-slate-300">Clear selection</button></>}{filteredUnreconciled.length > 0 && reconFilter === 'unreconciled' && <button disabled={bulkSaving} onClick={() => { if (confirm(`Reconcile all ${filteredUnreconciled.length} currently filtered unreconciled transactions?`)) reconcileIds(filteredUnreconciled.map(x => x.id)); }} className="ml-auto px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-[9px] font-black uppercase tracking-widest">Reconcile all filtered ({filteredUnreconciled.length})</button>}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-800/60 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-3 w-10"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} /></th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Bank / transaction</th><th className="p-3 text-right">Amount</th><th className="p-3 text-left">Classification</th><th className="p-3 text-left">Ledger / accounting</th><th className="p-3 text-center">Reconciliation</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-800">{filtered.map(tx => <tr key={tx.id} className={selected.has(tx.id) ? 'bg-cyan-500/5' : ''}><td className="p-3"><input type="checkbox" disabled={reconciled(tx)} checked={selected.has(tx.id)} onChange={() => toggle(tx.id)} /></td><td className="p-3 text-slate-400 whitespace-nowrap">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td><td className="p-3"><p className="font-bold text-white">{tx.description || tx.merchant || 'Transaction'}</p><p className="text-[10px] text-slate-500">{accountName(tx.bank_account_id)}{tx.reference ? ` · Ref ${tx.reference}` : ''}</p></td><td className={`p-3 text-right font-black ${tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.amount || 0)))}</td><td className="p-3"><select disabled={reconciled(tx) || bulkSaving} value={tx.transaction_category || 'unknown'} onChange={e => { const c = categories.find(x => x[0] === e.target.value) || categories[categories.length - 1]; prepareClassification(tx, c[0], c[2]); }} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white">{categories.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></td><td className="p-3 text-xs text-slate-400">{tx.accounting_category || 'Unassigned'}</td><td className="p-3 text-center"><span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${reconciled(tx) ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{reconciled(tx) ? 'RECONCILED' : 'OUTSTANDING'}</span></td><td className="p-3 text-right">{reconciled(tx) ? <span className="text-[9px] uppercase tracking-widest text-emerald-300 font-black">Complete</span> : <button disabled={saving === tx.id || bulkSaving} onClick={() => reconcileOne(tx)} className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest">{saving === tx.id ? 'Reconciling…' : 'Reconcile'}</button>}</td></tr>)}</tbody></table>{loading && <div className="p-12 text-center text-slate-500">Loading bank movements…</div>}{!loading && !filtered.length && <div className="p-12 text-center text-emerald-300 font-bold">No transactions match these filters.</div>}</div>
    </section>
    <style jsx>{`.filter{background:#020617;border:1px solid #334155;border-radius:.75rem;padding:.65rem .75rem;color:white;font-size:.75rem;min-width:0;width:100%}.btn-primary{background:#06b6d4;color:#020617;border-radius:.75rem;padding:.6rem 1rem;font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.btn-secondary{background:#1e293b;border:1px solid #334155;color:white;border-radius:.75rem;padding:.6rem 1rem;font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}`}</style>
  </main>;
}
