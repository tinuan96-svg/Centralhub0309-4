'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BankSyncService, BankAccount, BankTransaction } from '@/lib/services/banking/bankSyncService';
import { formatCurrency } from '@/lib/utils/currency';

type Summary = {
  revenue: number;
  cogs: number;
  variable_costs: number;
  operating_expenses: number;
  gross_profit: number;
  contribution_profit: number;
  net_profit: number;
  orders: number;
  units_sold: number;
  average_profit_per_order: number;
};

type FinanceTx = BankTransaction & {
  transaction_category: string | null;
  accounting_category: string | null;
  classified_at: string | null;
};

type Payable = {
  supplier_invoice_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  payment_alert: string;
  days_to_due: number;
};

type Tab = 'overview' | 'transactions' | 'payables' | 'profitability';

type Category = [string, string];

const categories: Category[] = [
  ['sales_income', 'Sales income'],
  ['supplier_payment', 'Supplier payment / COGS'],
  ['operating_expense', 'Operating expense'],
  ['tax', 'Tax'],
  ['refund', 'Refund'],
  ['transfer', 'Bank transfer'],
  ['financing', 'Finance / loan'],
  ['other_income', 'Other income'],
  ['other_expense', 'Other expense'],
  ['unknown', 'Needs review'],
];

function dateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function FinanceControlClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { startDate, endDate } = dateRange(days);

    const [summaryResult, accountsResult, transactionsResult, payablesResult] = await Promise.all([
      supabase.rpc('get_finance_period_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_store_id: null,
      }),
      BankSyncService.getBankAccounts(),
      supabase
        .from('bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .limit(100),
      supabase
        .from('supplier_payables_overview')
        .select('*')
        .neq('payment_alert', 'paid')
        .order('due_date', { ascending: true })
        .limit(100),
    ]);

    if (summaryResult.error) setError(summaryResult.error.message);
    else setSummary(summaryResult.data?.[0] || null);
    setAccounts(accountsResult || []);
    if (transactionsResult.error) setError(transactionsResult.error.message);
    else setTransactions((transactionsResult.data || []) as FinanceTx[]);
    if (payablesResult.error) setError(payablesResult.error.message);
    else setPayables((payablesResult.data || []) as Payable[]);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const cash = useMemo(
    () => accounts.reduce((total, account) => total + Number(account.current_balance || 0), 0),
    [accounts]
  );

  const openPayables = useMemo(
    () => payables.reduce((total, payable) => total + Number(payable.amount_due || 0), 0),
    [payables]
  );

  const reviewCount = useMemo(
    () => transactions.filter(tx => !tx.transaction_category || tx.transaction_category === 'unknown').length,
    [transactions]
  );

  const classify = async (tx: FinanceTx, category: string) => {
    setSaving(tx.id);
    const accounting =
      category === 'sales_income' || category === 'other_income' ? 'revenue' :
      category === 'supplier_payment' ? 'cogs' :
      category === 'operating_expense' ? 'operating_expense' :
      category === 'other_expense' ? 'other_expense' :
      category === 'tax' ? 'tax' :
      category === 'transfer' ? 'transfer' :
      category === 'financing' ? 'finance_cost' :
      'other';

    const { error: updateError } = await supabase
      .from('bank_transactions')
      .update({
        transaction_category: category,
        accounting_category: accounting,
        classified_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    if (updateError) {
      alert(updateError.message);
    } else {
      setTransactions(current =>
        current.map(item =>
          item.id === tx.id
            ? { ...item, transaction_category: category, accounting_category: accounting, classified_at: new Date().toISOString() }
            : item
        )
      );
    }
    setSaving(null);
  };

  const statusForPayable = (payable: Payable) => {
    if (payable.payment_alert === 'overdue' || Number(payable.days_to_due) < 0) return 'OVERDUE';
    if (Number(payable.days_to_due) <= 3) return `DUE IN ${payable.days_to_due}D`;
    return `DUE IN ${payable.days_to_due}D`;
  };

  const statusClass = (payable: Payable) =>
    payable.payment_alert === 'overdue' || Number(payable.days_to_due) < 0
      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      : Number(payable.days_to_due) <= 3
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        : 'bg-slate-800 text-slate-400 border-slate-700';

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-[1700px] mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Finance Control Centre</h1>
          <p className="text-sm text-slate-500 mt-1">Cash position, transaction classification, supplier payables and profit performance.</p>
        </div>
        <div className="flex gap-2 items-center">
          {[7, 30, 90].map(value => (
            <button
              key={value}
              onClick={() => setDays(value)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black tracking-widest ${days === value ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              {value} DAYS
            </button>
          ))}
          <button onClick={load} className="px-3 py-2 rounded-xl text-[10px] font-black bg-slate-800 text-white border border-slate-700">Refresh</button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Finance data warning: {error}
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="label">Available bank cash</p>
          <p className="metric text-white">{formatCurrency(cash)}</p>
          <p className="hint">{accounts.length} active/linked accounts</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="label">Revenue</p>
          <p className="metric text-white">{loading ? '—' : formatCurrency(Number(summary?.revenue || 0))}</p>
          <p className="hint">Selected period</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="label">Net profit</p>
          <p className={`metric ${Number(summary?.net_profit || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{loading ? '—' : formatCurrency(Number(summary?.net_profit || 0))}</p>
          <p className="hint">After operating costs</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="label">Supplier payables</p>
          <p className="metric text-amber-300">{formatCurrency(openPayables)}</p>
          <p className="hint">Open outstanding invoices</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="label">Needs review</p>
          <p className={`metric ${reviewCount ? 'text-amber-300' : 'text-emerald-300'}`}>{reviewCount}</p>
          <p className="hint">Unclassified bank transactions</p>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto bg-slate-950 p-1 rounded-2xl border border-slate-800 w-fit">
        {([
          ['overview', 'Overview'],
          ['transactions', `Transactions${reviewCount ? ` (${reviewCount})` : ''}`],
          ['payables', 'Supplier Payables'],
          ['profitability', 'Profitability'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab === key ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <section className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="section-title">Profit & Loss</h2><p className="section-help">Accounting view for the selected period.</p></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">{days} day view</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Revenue', summary?.revenue, 'text-white'],
                ['COGS', summary?.cogs, 'text-amber-300'],
                ['Variable costs', summary?.variable_costs, 'text-orange-300'],
                ['Operating expenses', summary?.operating_expenses, 'text-rose-300'],
                ['Gross profit', summary?.gross_profit, 'text-emerald-300'],
                ['Contribution', summary?.contribution_profit, 'text-cyan-300'],
                ['Net profit', summary?.net_profit, Number(summary?.net_profit || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'],
                ['Avg profit / order', summary?.average_profit_per_order, 'text-indigo-300'],
              ].map(([label, value, cls]) => (
                <div key={String(label)} className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                  <p className="label">{label}</p>
                  <p className={`text-lg font-black mt-2 ${cls}`}>{loading ? '—' : formatCurrency(Number(value || 0))}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="stat"><span>Orders</span><strong>{Number(summary?.orders || 0).toLocaleString('en-GB')}</strong></div>
              <div className="stat"><span>Units sold</span><strong>{Number(summary?.units_sold || 0).toLocaleString('en-GB')}</strong></div>
              <div className="stat"><span>Profit / order</span><strong>{formatCurrency(Number(summary?.average_profit_per_order || 0))}</strong></div>
              <div className="stat"><span>Open payables</span><strong>{formatCurrency(openPayables)}</strong></div>
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
            <h2 className="section-title">Bank Position</h2>
            <p className="section-help">Current balances from CentralHub bank accounts.</p>
            <div className="space-y-3 mt-5">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center justify-between rounded-2xl bg-slate-950 border border-slate-800 p-4">
                  <div><p className="font-bold text-white">{account.bank_name || 'Bank'}</p><p className="text-[10px] text-slate-500 uppercase tracking-widest">{account.account_name}</p></div>
                  <p className="font-black text-white">{formatCurrency(Number(account.current_balance || 0))}</p>
                </div>
              ))}
              {!accounts.length && !loading && <p className="text-sm text-slate-500 py-6 text-center">No bank accounts configured.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'transactions' && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-slate-800">
            <h2 className="section-title">Bank Transactions</h2>
            <p className="section-help">Classify each movement so the accounting and pricing engines know what it represents.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-4 text-left">Date</th><th className="p-4 text-left">Transaction</th><th className="p-4 text-right">Amount</th><th className="p-4 text-left">Category</th><th className="p-4 text-center">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="p-4 text-slate-400 whitespace-nowrap">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                    <td className="p-4"><div className="font-bold text-white">{tx.description}</div><div className="text-[10px] text-slate-600 font-mono">{tx.reference || 'NO REF'}</div></td>
                    <td className={`p-4 text-right font-black ${tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(Number(tx.amount || 0))}</td>
                    <td className="p-4"><select value={tx.transaction_category || 'unknown'} disabled={saving === tx.id} onChange={e => classify(tx, e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                    <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${tx.transaction_category && tx.transaction_category !== 'unknown' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{tx.transaction_category && tx.transaction_category !== 'unknown' ? 'Classified' : 'Review'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!transactions.length && !loading && <div className="p-12 text-center text-slate-500">No bank transactions found.</div>}
        </section>
      )}

      {tab === 'payables' && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><h2 className="section-title">Supplier Payables</h2><p className="section-help">Due dates are calculated from supplier credit terms and invoice dates.</p></div>
            <a href="/suppliers/invoices" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black text-white">Open Supplier Invoices</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-4 text-left">Supplier</th><th className="p-4 text-left">Invoice</th><th className="p-4 text-left">Invoice date</th><th className="p-4 text-left">Due date</th><th className="p-4 text-right">Outstanding</th><th className="p-4 text-center">Alert</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {payables.map(payable => (
                  <tr key={payable.supplier_invoice_id} className="hover:bg-slate-800/30">
                    <td className="p-4 font-bold text-white">{payable.supplier_name}</td>
                    <td className="p-4 text-slate-400">{payable.invoice_number}</td>
                    <td className="p-4 text-slate-400">{new Date(payable.invoice_date).toLocaleDateString('en-GB')}</td>
                    <td className="p-4 text-slate-400">{new Date(payable.due_date).toLocaleDateString('en-GB')}</td>
                    <td className="p-4 text-right font-black text-white">{formatCurrency(Number(payable.amount_due || 0))}</td>
                    <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${statusClass(payable)}`}>{statusForPayable(payable)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!payables.length && <div className="p-12 text-center text-slate-500">No open supplier payables.</div>}
        </section>
      )}

      {tab === 'profitability' && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            ['/profit-analysis', 'Order profitability', 'See individual orders, revenue, product cost, logistics and profit.'],
            ['/profit-analysis', 'Product / category profitability', 'Use the existing profit analysis to identify high and low contribution products.'],
            ['/suppliers', 'Supplier performance', 'Review supplier purchasing and invoice relationships before paying.'],
            ['/pricing', 'Pricing impact', 'Feed the financial picture into the existing pricing control centre.'],
          ].map(([href, title, description]) => (
            <a key={title} href={href} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 hover:border-cyan-500/40 transition-colors">
              <p className="text-cyan-400 text-[9px] font-black uppercase tracking-widest">Financial drilldown</p>
              <h2 className="text-lg font-black text-white mt-2">{title}</h2>
              <p className="text-sm text-slate-500 mt-2 leading-6">{description}</p>
              <p className="text-xs font-black text-slate-300 mt-5">Open →</p>
            </a>
          ))}
        </section>
      )}

      <style jsx>{`
        .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 900; letter-spacing: .12em; }
        .metric { font-size: 1.25rem; line-height: 1.5rem; font-weight: 900; margin-top: .5rem; }
        .hint { font-size: 10px; color: #64748b; margin-top: .25rem; }
        .section-title { font-size: 1.05rem; font-weight: 900; color: #fff; }
        .section-help { font-size: .75rem; color: #64748b; margin-top: .25rem; }
        .stat { background: #020617; border: 1px solid #1e293b; border-radius: 1rem; padding: .75rem 1rem; display: flex; justify-content: space-between; gap: .5rem; align-items: center; }
        .stat span { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 900; letter-spacing: .08em; }
        .stat strong { color: #fff; font-size: .9rem; }
      `}</style>
    </main>
  );
}
