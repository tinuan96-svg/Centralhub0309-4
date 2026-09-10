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
  source?: string | null;
  transaction_category?: string | null;
  accounting_category?: string | null;
  classification_status?: string | null;
  reconciliation_status?: string | null;
  is_reconciled?: boolean;
  reconciliation_notes?: string | null;
  notes?: string | null;
};

type PendingRule = {
  sourceId: string;
  category: string;
  accounting: string;
  sourceText: string;
  matches: Tx[];
};

type ImportEvidence = {
  matched_bank_transaction_id: string;
  source_sheet: string;
  review_status?: string | null;
  suggested_tax_rate?: string | null;
  match_status?: string | null;
};

type BankAccount = {
  id: string;
  bank_name: string;
  account_name: string;
};

type View = 'unreconciled' | 'all' | 'reconciled' | 'excel';

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

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const matchKeys = (tx: Tx) =>
  Array.from(
    new Set(
      [normalize(tx.description), normalize(tx.merchant), normalize(tx.reference)].filter(Boolean),
    ),
  );

async function fetchAllBankTransactions() {
  const pageSize = 1000;
  const all: Tx[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const page = (data || []) as Tx[];
    all.push(...page);
    if (page.length < pageSize) return { data: all, error: null };
  }
}

async function fetchAllImportEvidence() {
  const pageSize = 1000;
  const all: ImportEvidence[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('bank_reconciliation_import_items')
      .select('matched_bank_transaction_id,source_sheet,review_status,suggested_tax_rate,match_status')
      .not('matched_bank_transaction_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const page = (data || []) as ImportEvidence[];
    all.push(...page);
    if (page.length < pageSize) return { data: all, error: null };
  }
}

export default function FinanceTransactionsClient() {
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const [rows, setRows] = useState<Tx[]>([]);
  const [evidence, setEvidence] = useState<ImportEvidence[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRule | null>(null);
  const [view, setView] = useState<View>(requestedStatus === 'reconciled' ? 'reconciled' : 'unreconciled');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [txResult, evidenceResult, accountResult] = await Promise.all([
      fetchAllBankTransactions(),
      fetchAllImportEvidence(),
      supabase.from('store_bank_accounts').select('id,bank_name,account_name').order('bank_name'),
    ]);

    const firstError = txResult.error || evidenceResult.error || accountResult.error;
    if (firstError) setError(firstError.message);
    setRows(
      (txResult.data || []).map((row) => ({ ...row, is_reconciled: row.is_reconciled === true })),
    );
    setEvidence(evidenceResult.data || []);
    setBankAccounts((accountResult.data || []) as BankAccount[]);
    setPending(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const evidenceByTx = useMemo(() => {
    const map = new Map<string, ImportEvidence[]>();
    for (const item of evidence) {
      if (!item.matched_bank_transaction_id) continue;
      const existing = map.get(item.matched_bank_transaction_id) || [];
      existing.push(item);
      map.set(item.matched_bank_transaction_id, existing);
    }
    return map;
  }, [evidence]);

  const bankAccountById = useMemo(
    () => new Map(bankAccounts.map((account) => [account.id, account])),
    [bankAccounts],
  );

  const unreconciled = rows.filter(
    (row) => !row.is_reconciled && row.reconciliation_status !== 'reconciled',
  );
  const reconciled = rows.filter(
    (row) => row.is_reconciled || row.reconciliation_status === 'reconciled',
  );
  const excelReviewed = rows.filter((row) => evidenceByTx.has(row.id));
  const visibleRows = useMemo(() => {
    if (view === 'unreconciled') return unreconciled;
    if (view === 'reconciled') return reconciled;
    if (view === 'excel') return excelReviewed;
    return rows;
  }, [view, rows, unreconciled, reconciled, excelReviewed]);

  const review = visibleRows.filter(
    (row) =>
      !row.transaction_category ||
      row.transaction_category === 'unknown' ||
      row.classification_status === 'needs_review',
  ).length;
  const previewMatches = useMemo(() => pending?.matches || [], [pending]);

  const prepareClassification = (tx: Tx, category: string, accounting: string) => {
    if (category === 'unknown') {
      setPending(null);
      return;
    }
    const sourceKeys = matchKeys(tx);
    const sourceIndex = rows.findIndex((row) => row.id === tx.id);
    const matches = rows.filter(
      (row, index) =>
        index > sourceIndex &&
        !row.is_reconciled &&
        row.reconciliation_status !== 'reconciled' &&
        (row.classification_status === 'needs_review' ||
          !row.transaction_category ||
          row.transaction_category === 'unknown') &&
        matchKeys(row).some((key) => sourceKeys.includes(key)),
    );
    setPending({
      sourceId: tx.id,
      category,
      accounting,
      sourceText: tx.description || tx.merchant || tx.reference || tx.id,
      matches,
    });
  };

  const classifyOne = async (tx: Tx, category: string, accounting: string) => {
    setSaving(tx.id);
    setError(null);
    const { error: classifyError } = await supabase.rpc('classify_financial_transaction', {
      p_transaction_id: tx.id,
      p_transaction_category: category,
      p_accounting_category: accounting,
      p_notes: tx.notes || null,
    });
    if (classifyError) setError(classifyError.message);
    else {
      setRows((current) =>
        current.map((row) =>
          row.id === tx.id
            ? {
                ...row,
                transaction_category: category === 'savings_allocation' ? 'transfer' : category,
                accounting_category: accounting,
                classification_status: category === 'unknown' ? 'needs_review' : 'classified',
              }
            : row,
        ),
      );
    }
    setSaving(null);
  };

  const applyPending = async () => {
    if (!pending) return;
    const targets = [pending.sourceId, ...pending.matches.map((row) => row.id)];
    setBulkSaving(true);
    setError(null);
    const results = await Promise.all(
      targets.map((id) =>
        supabase.rpc('classify_financial_transaction', {
          p_transaction_id: id,
          p_transaction_category: pending.category,
          p_accounting_category: pending.accounting,
          p_notes: null,
        }),
      ),
    );
    const failed = results.find((result) => result.error)?.error;
    if (failed) {
      setError(failed.message);
      setBulkSaving(false);
      return;
    }
    setRows((current) =>
      current.map((row) =>
        targets.includes(row.id)
          ? {
              ...row,
              transaction_category:
                pending.category === 'savings_allocation' ? 'transfer' : pending.category,
              accounting_category: pending.accounting,
              classification_status: 'classified',
            }
          : row,
      ),
    );
    setPending(null);
    setBulkSaving(false);
  };

  const reconcile = async (tx: Tx) => {
    setReconciling(tx.id);
    setError(null);
    const { error: reconcileError } = await supabase.rpc('reconcile_bank_transaction', {
      p_transaction_id: tx.id,
      p_notes: 'Reconciled from Bank Reconciliation centre',
    });
    if (reconcileError) setError(reconcileError.message);
    else {
      setRows((current) =>
        current.map((row) =>
          row.id === tx.id
            ? {
                ...row,
                is_reconciled: true,
                reconciliation_status: 'reconciled',
                reconciliation_notes: 'Reconciled from Bank Reconciliation centre',
              }
            : row,
        ),
      );
    }
    setReconciling(null);
  };

  const bankLabel = (tx: Tx) => {
    const account = tx.bank_account_id ? bankAccountById.get(tx.bank_account_id) : null;
    if (account) return `${account.bank_name} · ${account.account_name}`;
    return tx.source || 'Bank source';
  };

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-[1700px] mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Bank Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-1">Reconcile every bank movement separately from its accounting classification. Imported review evidence stays attached to the bank movement.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Finance</Link>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Refresh</button>
        </div>
      </header>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-slate-300">
        <span className="font-black text-cyan-300">How reconciliation works:</span> classify the movement, verify what it represents, then click <b>Reconcile</b>. A classified transaction is still outstanding until it is reconciled. Excel review evidence is guidance, not automatic approval.
      </div>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Total bank movements</p><p className="text-2xl font-black text-white">{rows.length}</p></div>
        <button onClick={() => setView('unreconciled')} className={`text-left bg-slate-900 border rounded-2xl p-4 ${view === 'unreconciled' ? 'border-amber-400/50' : 'border-slate-800'}`}><p className="text-[10px] text-slate-500 uppercase font-black">Left to reconcile</p><p className={`text-2xl font-black ${unreconciled.length ? 'text-amber-300' : 'text-emerald-300'}`}>{unreconciled.length}</p></button>
        <button onClick={() => setView('reconciled')} className={`text-left bg-slate-900 border rounded-2xl p-4 ${view === 'reconciled' ? 'border-emerald-400/50' : 'border-slate-800'}`}><p className="text-[10px] text-slate-500 uppercase font-black">Reconciled</p><p className="text-2xl font-black text-emerald-300">{reconciled.length}</p></button>
        <button onClick={() => setView('excel')} className={`text-left bg-slate-900 border rounded-2xl p-4 ${view === 'excel' ? 'border-cyan-400/50' : 'border-slate-800'}`}><p className="text-[10px] text-slate-500 uppercase font-black">Excel evidence</p><p className="text-2xl font-black text-cyan-300">{excelReviewed.length}</p></button>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Outstanding value</p><p className="text-2xl font-black text-rose-300">{formatCurrency(unreconciled.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0))}</p></div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setView('unreconciled')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${view === 'unreconciled' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>Unreconciled ({unreconciled.length})</button>
        <button onClick={() => setView('all')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${view === 'all' ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>All ({rows.length})</button>
        <button onClick={() => setView('reconciled')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${view === 'reconciled' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>Reconciled ({reconciled.length})</button>
        <button onClick={() => setView('excel')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${view === 'excel' ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>Excel Review ({excelReviewed.length})</button>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-slate-500">{review} need classification in this view</span>
      </div>

      {pending && (
        <section className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Matching transactions found</p>
              <h2 className="text-lg font-black text-white mt-1">Apply “{categories.find((category) => category[0] === pending.category)?.[1]}” to repeated transactions?</h2>
              <p className="text-xs text-slate-400 mt-1">These are still unreconciled and match the same normalized name, description, merchant or reference. Nothing is saved until you click Apply.</p>
            </div>
            <div className="flex gap-2">
              <button disabled={bulkSaving} onClick={() => { const source = rows.find((row) => row.id === pending.sourceId); if (source) classifyOne(source, pending.category, pending.accounting); setPending(null); }} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Selected only</button>
              <button disabled={bulkSaving} onClick={applyPending} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-widest">{bulkSaving ? 'Applying…' : `Apply to ${previewMatches.length + 1} transactions`}</button>
              <button disabled={bulkSaving} onClick={() => setPending(null)} className="px-3 py-2 rounded-xl text-slate-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
            </div>
          </div>
          <div className="grid gap-2 max-h-64 overflow-auto">
            {[rows.find((row) => row.id === pending.sourceId), ...previewMatches].filter(Boolean).map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
                <div><span className="text-xs font-bold text-white">{tx.description || tx.merchant || 'Transaction'}</span><span className="text-[10px] text-slate-500 ml-3">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</span></div>
                <span className={`text-xs font-black ${tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Number(tx.amount || 0))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-4 text-left">Date</th><th className="p-4 text-left">Transaction</th><th className="p-4 text-right">Amount</th><th className="p-4 text-left">Classification</th><th className="p-4 text-left">Accounting</th><th className="p-4 text-center">Reconciliation</th><th className="p-4 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {visibleRows.map((tx) => {
                const rowEvidence = evidenceByTx.get(tx.id) || [];
                return (
                  <tr key={tx.id} className={pending?.matches.some((row) => row.id === tx.id) ? 'bg-cyan-500/5' : ''}>
                    <td className="p-4 text-slate-400 whitespace-nowrap">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                    <td className="p-4">
                      <p className="font-bold text-white">{tx.description}</p>
                      <p className="text-[10px] text-slate-500">{tx.merchant || tx.reference || ''}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{bankLabel(tx)}</p>
                      {rowEvidence.map((item, index) => (
                        <div key={`${item.source_sheet}-${index}`} className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5">
                          <p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Excel review · {item.source_sheet}</p>
                          {item.review_status && <p className="text-[10px] text-slate-300 mt-0.5">{item.review_status}</p>}
                          {item.suggested_tax_rate && <p className="text-[9px] text-slate-500">Tax: {item.suggested_tax_rate}</p>}
                        </div>
                      ))}
                    </td>
                    <td className={`p-4 text-right font-black ${tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Number(tx.amount || 0))}</td>
                    <td className="p-4"><select disabled={saving === tx.id || bulkSaving || tx.is_reconciled} value={tx.transaction_category || 'unknown'} onChange={(event) => { const category = categories.find((item) => item[0] === event.target.value) || categories[categories.length - 1]; prepareClassification(tx, category[0], category[2]); }} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white">{categories.map((category) => <option key={category[0]} value={category[0]}>{category[1]}</option>)}</select></td>
                    <td className="p-4 text-xs text-slate-400">{tx.accounting_category || '—'}</td>
                    <td className="p-4 text-center"><span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${tx.is_reconciled || tx.reconciliation_status === 'reconciled' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{tx.is_reconciled || tx.reconciliation_status === 'reconciled' ? 'RECONCILED' : 'OUTSTANDING'}</span></td>
                    <td className="p-4 text-right">{tx.is_reconciled || tx.reconciliation_status === 'reconciled' ? <span className="text-[9px] uppercase tracking-widest text-emerald-300 font-black">Complete</span> : <button disabled={reconciling === tx.id || bulkSaving} onClick={() => reconcile(tx)} className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest">{reconciling === tx.id ? 'Reconciling…' : 'Reconcile'}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && <div className="p-12 text-center text-slate-500">Loading all bank movements…</div>}
          {!loading && !visibleRows.length && <div className="p-12 text-center text-emerald-300 font-bold">Nothing left to reconcile in this view.</div>}
        </div>
      </section>
    </main>
  );
}
