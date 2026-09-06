'use client';

import Link from 'next/link';
import type { BankTransaction } from '@/lib/services/banking/bankSyncService';
import { formatCurrency } from '@/lib/utils/currency';

interface FinanceReconciliationPanelProps {
  transactions: BankTransaction[];
  accountLabel: string;
  onMatchOrders: (transaction: BankTransaction) => void;
}

export default function FinanceReconciliationPanel({ transactions, accountLabel, onMatchOrders }: FinanceReconciliationPanelProps) {
  const unreconciled = transactions.filter((transaction) => !transaction.is_reconciled);
  const reconciled = transactions.filter((transaction) => transaction.is_reconciled);
  const unmatchedGatewayPayouts = unreconciled.filter((transaction) => transaction.category === 'Gateway Payout');
  const unmatchedCredits = unreconciled
    .filter((transaction) => transaction.type === 'credit')
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const unmatchedDebits = unreconciled
    .filter((transaction) => transaction.type === 'debit')
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const recentUnreconciled = unreconciled.slice(0, 8);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-5 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-tight">Finance Reconciliation</h2>
          <p className="text-xs text-slate-500 mt-1">{accountLabel} · match bank payouts to CentralHub orders and keep finance records clean.</p>
        </div>
        <Link href="/finance/ledger" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest transition-colors">
          Open Finance Ledger
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5 sm:p-6 border-b border-slate-800">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">Unmatched</p>
          <p className="text-2xl font-black text-amber-300 mt-1">{unreconciled.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70">Reconciled</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">{reconciled.length}</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/70">Unmatched In</p>
          <p className="text-lg font-black text-cyan-300 mt-1">{formatCurrency(unmatchedCredits)}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-400/70">Unmatched Out</p>
          <p className="text-lg font-black text-rose-300 mt-1">{formatCurrency(unmatchedDebits)}</p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transactions needing review</p>
            <p className="text-[10px] text-slate-600 mt-1">{unmatchedGatewayPayouts.length} gateway payout{unmatchedGatewayPayouts.length === 1 ? '' : 's'} ready for order matching.</p>
          </div>
        </div>

        {recentUnreconciled.length === 0 ? (
          <div className="py-10 text-center rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/5">
            <p className="text-sm font-black text-emerald-300">All loaded transactions are reconciled.</p>
            <p className="text-[10px] text-slate-500 mt-1">No finance reconciliation action is required for this account.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentUnreconciled.map((transaction) => (
              <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-100 truncate">{transaction.description}</p>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] font-black uppercase text-amber-300">Unmatched</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {new Date(transaction.transaction_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {transaction.reference ? ` · ${transaction.reference}` : ''}
                    {transaction.category ? ` · ${transaction.category}` : ''}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                  <p className={`text-sm font-black ${transaction.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {transaction.type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </p>
                  {transaction.category === 'Gateway Payout' ? (
                    <button type="button" onClick={() => onMatchOrders(transaction)} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest transition-colors">
                      Match Orders
                    </button>
                  ) : (
                    <span className="px-3 py-2 rounded-xl bg-slate-800 text-slate-500 text-[9px] font-black uppercase tracking-widest">Review</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
