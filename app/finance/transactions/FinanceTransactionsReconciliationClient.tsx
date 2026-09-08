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
  transaction_time?: string | null;
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
  ledger_account_id?: string | null;
  creditor_id?: string | null;
  total_matches?: number | string | null;
};

type Account = { id: string; bank_name?: string | null; account_name?: string | null; account_number?: string | null };
type Ledger = {
  id: string;
  code: string;
  name: string;
  ledger_type?: string | null;
  pnl_class?: string | null;
  description?: string | null;
  is_active?: boolean | null;
};

type Summary = {
  total_transactions: number;
  unreconciled_transactions: number;
  reconciled_transactions: number;
  unreconciled_value: number;
};

const PAGE_SIZE = 100;
const COMMON_LEDGER_CODES = ['5110', '5120', '6010', '6020', '6030', '6040', '6100', '6200', '6310', '9000'];

const categories = [
  ['sales_income', 'Sales income', 'revenue'],
  ['supplier_payment', 'Supplier payment / stock purchase', 'cogs'],
  ['operating_expense', 'General operating expense', 'operating_expense'],
  ['tax', 'Tax', 'tax'],
  ['refund', 'Customer refund', 'other'],
  ['transfer', 'Bank transfer / own account', 'transfer'],
  ['financing', 'Loan / finance movement', 'finance_cost'],
  ['other_income', 'Other income', 'revenue'],
  ['other_expense', 'Other expense', 'other'],
  ['unknown', 'Needs review', 'other'],
] as const;

const reconciled = (tx: Tx) => Boolean(tx.is_reconciled) || tx.reconciliation_status === 'reconciled';

const ledgerTransactionCategory = (ledger: Ledger) => {
  if (ledger.ledger_type === 'internal') return 'transfer';
  if (ledger.ledger_type === 'income') return ledger.pnl_class === 'revenue' ? 'sales_income' : 'other_income';
  if (ledger.pnl_class === 'cogs') return 'supplier_payment';
  if (ledger.pnl_class === 'finance_cost') return 'financing';
  if (ledger.pnl_class === 'tax') return 'tax';
  if (ledger.pnl_class === 'other_expense') return 'other_expense';
  if (ledger.ledger_type === 'expense') return 'operating_expense';
  if (ledger.ledger_type === 'liability') return 'financing';
  return 'other_expense';
};

const ledgerAccountingCategory = (ledger: Ledger) => {
  if (ledger.pnl_class === 'revenue' || ledger.pnl_class === 'other_income') return 'revenue';
  if (ledger.pnl_class === 'cogs') return 'cogs';
  if (ledger.pnl_class === 'variable_expense') return 'variable_cost';
  if (ledger.pnl_class === 'operating_expense') return 'operating_expense';
  if (ledger.pnl_class === 'finance_cost') return 'finance_cost';
  if (ledger.pnl_class === 'tax') return 'tax';
  if (ledger.ledger_type === 'asset' || ledger.ledger_type === 'liability' || ledger.ledger_type === 'equity' || ledger.ledger_type === 'internal') {
    return ledger.ledger_type === 'internal' ? 'transfer' : ledger.ledger_type;
  }
  return 'other';
};

export default function FinanceTransactionsReconciliationClient() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_transactions: 0, unreconciled_transactions: 0, reconciled_transactions: 0, unreconciled_value: 0 });
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [actionMs, setActionMs] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [direction, setDirection] = useState('all');
  const [classification, setClassification] = useState('all');
  const [reconFilter, setReconFilter] = useState(searchParams.get('status') === 'reconciled' ? 'reconciled' : 'unreconciled');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const loadSummary = useCallback(async () => {
    const { data, error: summaryError } = await supabase.rpc('get_bank_reconciliation_summary');
    if (summaryError) throw summaryError;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setSummary({
        total_transactions: Number(row.total_transactions || 0),
        unreconciled_transactions: Number(row.unreconciled_transactions || 0),
        reconciled_transactions: Number(row.reconciled_transactions || 0),
        unreconciled_value: Number(row.unreconciled_value || 0),
      });
    }
  }, []);

  const loadMeta = useCallback(async () => {
    const [accountResult, ledgerResult] = await Promise.all([
      supabase.from('store_bank_accounts').select('id,bank_name,account_name,account_number').order('bank_name', { ascending: true }),
      supabase.from('finance_ledger_accounts').select('id,code,name,ledger_type,pnl_class,description,is_active').eq('is_active', true).order('code', { ascending: true }),
    ]);
    if (accountResult.error) throw accountResult.error;
    if (ledgerResult.error) throw ledgerResult.error;
    setAccounts((accountResult.data || []) as Account[]);
    setLedgers((ledgerResult.data || []) as Ledger[]);
  }, []);

  const loadRows = useCallback(async () => {
    const started = performance.now();
    setLoading(true);
    setError(null);
    const { data, error: rowError } = await supabase.rpc('get_bank_reconciliation_page', {
      p_reconciliation: reconFilter,
      p_bank_account_id: accountFilter === 'all' ? null : accountFilter,
      p_direction: direction === 'all' ? null : direction,
      p_transaction_category: classification === 'all' ? null : classification,
      p_accounting_category: null,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_min_amount: minAmount === '' ? null : Number(minAmount),
      p_max_amount: maxAmount === '' ? null : Number(maxAmount),
      p_search: search.trim() || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (rowError) {
      setError(rowError.message);
      setRows([]);
      setTotalMatches(0);
    } else {
      const next = (data || []) as Tx[];
      if (!next.length && page > 0) {
        setPage(0);
      } else {
        setRows(next);
        setTotalMatches(Number(next[0]?.total_matches || 0));
      }
    }
    setLoadMs(Math.round(performance.now() - started));
    setLoading(false);
  }, [accountFilter, classification, direction, fromDate, maxAmount, minAmount, page, reconFilter, search, toDate]);

  useEffect(() => {
    Promise.all([loadMeta(), loadSummary()]).catch((e: any) => setError(e?.message || 'Could not load finance metadata'));
  }, [loadMeta, loadSummary]);

  useEffect(() => {
    const timer = window.setTimeout(() => { loadRows(); }, search.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadRows, search]);

  const accountName = (id?: string | null) => {
    const a = accounts.find(x => x.id === id);
    return a ? `${a.bank_name || 'Bank'}${a.account_name ? ` · ${a.account_name}` : ''}` : 'Unknown account';
  };

  const commonLedgers = useMemo(() => ledgers.filter(l => COMMON_LEDGER_CODES.includes(l.code)), [ledgers]);
  const otherLedgers = useMemo(() => ledgers.filter(l => !COMMON_LEDGER_CODES.includes(l.code)), [ledgers]);

  const resetPage = () => setPage(0);
  const clearFilters = () => {
    setSearch(''); setAccountFilter('all'); setDirection('all'); setClassification('all'); setReconFilter('unreconciled');
    setFromDate(''); setToDate(''); setMinAmount(''); setMaxAmount(''); setPage(0); setShowMoreFilters(false);
  };

  const applyChoice = async (tx: Tx, value: string) => {
    if (!value || value === 'unknown') return;
    let category = value;
    let accounting = categories.find(c => c[0] === value)?.[2] || 'other';
    let ledgerId: string | null = null;
    let label = categories.find(c => c[0] === value)?.[1] || value;

    if (value.startsWith('ledger:')) {
      const ledger = ledgers.find(l => l.id === value.slice(7));
      if (!ledger) return;
      ledgerId = ledger.id;
      category = ledgerTransactionCategory(ledger);
      accounting = ledgerAccountingCategory(ledger);
      label = `${ledger.code} · ${ledger.name}`;
    }

    const started = performance.now();
    setSaving(tx.id);
    setError(null);
    setNotice(null);
    const { data, error: actionError } = await supabase.rpc('learn_and_reconcile_bank_transaction', {
      p_transaction_id: tx.id,
      p_transaction_category: category,
      p_accounting_category: accounting,
      p_ledger_account_id: ledgerId,
    });
    setActionMs(Math.round(performance.now() - started));

    if (actionError) {
      setError(actionError.message);
      setSaving(null);
      return;
    }

    const result = data as any;
    const learnedLabel = result?.match_label || tx.merchant || tx.description || 'this transaction';
    const affected = Number(result?.affected_count || 1);
    const reconciledCount = Number(result?.reconciled_count || 0);
    if (result?.auto_reconcile) {
      setNotice(`Saved ${label} for “${learnedLabel}”. ${affected} exact matching transaction${affected === 1 ? '' : 's'} updated and ${reconciledCount} reconciled automatically. Future exact matches will be handled automatically.`);
    } else {
      setNotice(`Saved ${label} for “${learnedLabel}” and learned the rule. This type still needs invoice/order evidence before final reconciliation, so CentralHub did not auto-close it.`);
    }

    await Promise.all([loadRows(), loadSummary()]);
    setSaving(null);
  };

  const choiceValue = (tx: Tx) => tx.ledger_account_id && ledgers.some(l => l.id === tx.ledger_account_id)
    ? `ledger:${tx.ledger_account_id}`
    : (tx.transaction_category || 'unknown');

  const pageStart = totalMatches ? page * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, totalMatches);
  const hasNext = pageEnd < totalMatches;

  return (
    <main className="p-3 sm:p-5 space-y-4 max-w-[1800px] mx-auto">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
        <div>
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Bank Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-1">Choose the correct expense or ledger head once. CentralHub learns the exact merchant and handles matching debit transactions automatically.</p>
          <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">Exact-match learning ON</span>
            {loadMs !== null && <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">Last page load {loadMs} ms</span>}
            {actionMs !== null && <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">Last action {actionMs} ms</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/finance" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Finance</Link>
          <button onClick={() => Promise.all([loadRows(), loadSummary()])} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-widest">Refresh</button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <button onClick={() => { setReconFilter('unreconciled'); setPage(0); }} className={`text-left bg-slate-900 border rounded-2xl p-3 sm:p-4 ${reconFilter === 'unreconciled' ? 'border-amber-400/50' : 'border-slate-800'}`}>
          <p className="text-[9px] text-slate-500 uppercase font-black">Left to reconcile</p><p className="text-xl sm:text-2xl font-black text-amber-300">{summary.unreconciled_transactions.toLocaleString('en-GB')}</p>
        </button>
        <button onClick={() => { setReconFilter('reconciled'); setPage(0); }} className={`text-left bg-slate-900 border rounded-2xl p-3 sm:p-4 ${reconFilter === 'reconciled' ? 'border-emerald-400/50' : 'border-slate-800'}`}>
          <p className="text-[9px] text-slate-500 uppercase font-black">Reconciled</p><p className="text-xl sm:text-2xl font-black text-emerald-300">{summary.reconciled_transactions.toLocaleString('en-GB')}</p>
        </button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Current filter</p><p className="text-xl sm:text-2xl font-black text-cyan-300">{totalMatches.toLocaleString('en-GB')}</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Unreconciled value</p><p className="text-lg sm:text-xl font-black text-white">{formatCurrency(summary.unreconciled_value)}</p></div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_220px_180px_180px] gap-2">
          <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search merchant, description or reference…" className="filter" />
          <select value={accountFilter} onChange={e => { setAccountFilter(e.target.value); resetPage(); }} className="filter"><option value="all">All bank accounts</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` · ${a.account_name}` : ''}</option>)}</select>
          <select value={direction} onChange={e => { setDirection(e.target.value); resetPage(); }} className="filter"><option value="all">Credits & debits</option><option value="debit">Expenses / debits</option><option value="credit">Income / credits</option></select>
          <select value={reconFilter} onChange={e => { setReconFilter(e.target.value); resetPage(); }} className="filter"><option value="unreconciled">Needs reconciliation</option><option value="all">All transactions</option><option value="reconciled">Reconciled only</option></select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setShowMoreFilters(v => !v)} className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-300">{showMoreFilters ? 'Hide extra filters' : 'More filters'}</button>
          <button onClick={clearFilters} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300">Clear</button>
          <span className="ml-auto text-[10px] text-slate-500">Showing {pageStart}-{pageEnd} of {totalMatches.toLocaleString('en-GB')}</span>
        </div>
        {showMoreFilters && <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={classification} onChange={e => { setClassification(e.target.value); resetPage(); }} className="filter"><option value="all">Any classification</option>{categories.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); resetPage(); }} className="filter" />
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); resetPage(); }} className="filter" />
          <input inputMode="decimal" value={minAmount} onChange={e => { setMinAmount(e.target.value); resetPage(); }} placeholder="Min £" className="filter" />
          <input inputMode="decimal" value={maxAmount} onChange={e => { setMaxAmount(e.target.value); resetPage(); }} placeholder="Max £" className="filter" />
        </div>}
      </section>

      <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
        <strong className="text-cyan-300">New simple flow:</strong> pick the real ledger head once. Exact matching debit expenses are classified + reconciled immediately, previous exact matches are cleaned up at the same time, and future exact matches are automatic. Supplier payments, refunds and sales credits stay open until their invoice/order evidence is matched.
      </section>

      <section className="space-y-2">
        {loading && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">Loading bank movements…</div>}
        {!loading && rows.map(tx => {
          const currentLedger = tx.ledger_account_id ? ledgers.find(l => l.id === tx.ledger_account_id) : null;
          const currentCategory = categories.find(c => c[0] === (tx.transaction_category || 'unknown'))?.[1] || 'Needs review';
          const isDone = reconciled(tx);
          const requiresEvidence = !isDone && ['supplier_payment', 'sales_income', 'refund'].includes(tx.transaction_category || '');
          return <article key={tx.id} className={`rounded-2xl border p-3 sm:p-4 ${isDone ? 'border-emerald-500/15 bg-slate-900/70' : 'border-slate-800 bg-slate-900'}`}>
            <div className="grid grid-cols-1 lg:grid-cols-[110px_minmax(260px,1fr)_130px_minmax(280px,390px)_150px] gap-3 lg:items-center">
              <div>
                <p className="text-xs font-bold text-slate-300">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</p>
                <p className="text-[9px] text-slate-600 mt-1">{accountName(tx.bank_account_id)}</p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white truncate">{tx.merchant || tx.description || 'Bank transaction'}</p>
                  {tx.creditor_id && <span className="text-[8px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-black uppercase">Known creditor</span>}
                </div>
                {tx.description && tx.description !== tx.merchant && <p className="text-[10px] text-slate-500 truncate mt-1">{tx.description}</p>}
                <p className="text-[9px] text-slate-600 font-mono truncate mt-1">{tx.reference || 'No reference'}</p>
              </div>

              <div className="lg:text-right">
                <p className={`text-lg font-black ${tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.amount || 0)))}</p>
                {tx.balance != null && <p className="text-[9px] text-slate-600">Bal {formatCurrency(Number(tx.balance))}</p>}
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Expense / accounting head</label>
                <select
                  disabled={isDone || saving === tx.id}
                  value={choiceValue(tx)}
                  onChange={e => applyChoice(tx, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white disabled:opacity-60"
                >
                  <option value="unknown">Choose the correct head…</option>
                  <optgroup label="Common business expenses / transfers">
                    {commonLedgers.map(ledger => <option key={ledger.id} value={`ledger:${ledger.id}`}>{ledger.code} · {ledger.name}</option>)}
                  </optgroup>
                  <optgroup label="Other chart of accounts heads">
                    {otherLedgers.map(ledger => <option key={ledger.id} value={`ledger:${ledger.id}`}>{ledger.code} · {ledger.name}</option>)}
                  </optgroup>
                  <optgroup label="General categories">
                    {categories.filter(c => c[0] !== 'unknown').map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
                  </optgroup>
                </select>
                <p className="text-[9px] text-slate-600 mt-1 truncate">Current: {currentLedger ? `${currentLedger.code} · ${currentLedger.name}` : currentCategory}</p>
              </div>

              <div className="lg:text-right">
                {saving === tx.id ? <span className="inline-flex px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[9px] font-black uppercase">Learning…</span>
                  : isDone ? <span className="inline-flex px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase">Reconciled</span>
                  : requiresEvidence ? <div className="space-y-1"><span className="inline-flex px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] font-black uppercase">Evidence match needed</span>{tx.transaction_category === 'supplier_payment' && <Link href="/finance/payables" className="block text-[9px] text-cyan-300">Open supplier payables →</Link>}{tx.type === 'credit' && <Link href="/banking" className="block text-[9px] text-cyan-300">Match payout/orders →</Link>}</div>
                  : <span className="inline-flex px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] font-black uppercase">Choose head</span>}
              </div>
            </div>
          </article>;
        })}
        {!loading && !rows.length && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center"><p className="font-black text-emerald-300">Nothing to reconcile in this view.</p><p className="text-xs text-slate-500 mt-1">Try another filter or account.</p></div>}
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <button disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white disabled:opacity-40">← Previous</button>
        <span className="text-[10px] text-slate-500">Page {page + 1} · {pageStart}-{pageEnd} of {totalMatches.toLocaleString('en-GB')}</span>
        <button disabled={!hasNext || loading} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white disabled:opacity-40">Next →</button>
      </div>

      <style jsx>{`.filter{background:#020617;border:1px solid #334155;border-radius:.75rem;padding:.7rem .8rem;color:white;font-size:.75rem;min-width:0;width:100%;outline:none}.filter:focus{border-color:#06b6d4}`}</style>
    </main>
  );
}
