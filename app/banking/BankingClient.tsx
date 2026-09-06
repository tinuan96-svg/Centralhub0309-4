'use client';

import { useCallback, useEffect, useState } from 'react';
import { BankSyncService, BankAccount, BankTransaction } from '@/lib/services/banking/bankSyncService';
import { ReconciliationService } from '@/lib/services/banking/reconciliationService';
import { formatCurrency } from '@/lib/utils/currency';
import { useStore } from '@/lib/store/useStore';

export default function BankingPage({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ bank_name: 'Monzo', account_name: '', store_id: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [reconcilingTx, setReconcilingTx] = useState<BankTransaction | null>(null);
  const [matchingOrders, setMatchingOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isReconciling, setIsReconciling] = useState(false);

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await BankSyncService.getBankAccounts();
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) setSelectedAccountId(data[0].id);
    } catch (error) {
      console.error('Failed to load bank accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountId]);

  const loadTransactions = useCallback(async (accountId: string) => {
    try {
      setTransactions(await BankSyncService.getTransactions(accountId));
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (selectedAccountId) loadTransactions(selectedAccountId); }, [selectedAccountId, loadTransactions]);

  const handleAddAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await BankSyncService.createBankAccount({
        ...newAccount,
        currency: 'GBP',
        current_balance: 0,
        is_active: true,
      } as Partial<BankAccount>);
      setIsAddAccountOpen(false);
      setNewAccount({ bank_name: 'Monzo', account_name: '', store_id: '' });
      await loadAccounts();
    } catch (error) {
      console.error('Failed to add bank account:', error);
      alert('Error adding bank account.');
    }
  };

  const handleStartReconciliation = async (tx: BankTransaction) => {
    setReconcilingTx(tx);
    try {
      const orders = await ReconciliationService.findMatchingOrders(tx.id);
      setMatchingOrders(orders);
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error('Failed to find matching orders:', error);
      setMatchingOrders([]);
    }
  };

  const handleReconcile = async () => {
    if (!reconcilingTx || selectedOrderIds.size === 0) return;
    setIsReconciling(true);
    try {
      const orderIds = Array.from(selectedOrderIds);
      const fees: Record<string, number> = {};
      orderIds.forEach((id) => {
        const order = matchingOrders.find((item) => item.id === id);
        fees[id] = order?.gateway_fee_estimated || 0;
      });
      const result = await ReconciliationService.reconcileOrdersWithTx({
        transactionId: reconcilingTx.id,
        orderIds,
        fees,
      });
      if (result.success) {
        alert('Transactions reconciled successfully!');
        setReconcilingTx(null);
        if (selectedAccountId) await loadTransactions(selectedAccountId);
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setIsReconciling(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const totalCash = accounts.reduce((sum, account) => sum + (Number(account.current_balance) || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tighter">Banking & Cashflow</h1>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 fold-inner:grid-cols-3 gap-6">
          <div className="fold-inner:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white uppercase tracking-tight">Bank Accounts</h2>
              <button
                onClick={() => setIsAddAccountOpen(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                + Add Account
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`text-left p-5 rounded-2xl border transition-all cursor-pointer ${selectedAccountId === account.id ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-2xl">🏦</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${account.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <h3 className="font-black text-white text-lg tracking-tight">{account.bank_name || 'Generic Bank'}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{account.account_name}</p>
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Current Balance</p>
                    <p className="text-xl font-black text-white">{formatCurrency(account.current_balance)}</p>
                  </div>
                </button>
              ))}
              {accounts.length === 0 && !isLoading && (
                <div className="col-span-2 py-12 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                  <p className="text-slate-500 italic">No bank accounts linked yet.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-lg font-bold text-white uppercase tracking-tight mb-6 text-indigo-400">Cashflow Overview</h2>
            <div className="space-y-6">
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Available Cash</p>
                <p className="text-2xl font-black text-white">{formatCurrency(totalCash)}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-500/70 uppercase font-black tracking-widest mb-1">Incoming</p>
                  <p className="text-lg font-black text-emerald-400">--</p>
                </div>
                <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/20">
                  <p className="text-[10px] text-rose-500/70 uppercase font-black tracking-widest mb-1">Outgoing</p>
                  <p className="text-lg font-black text-rose-400">--</p>
                </div>
              </div>
              <div className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-3">Health Status</p>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <p className="text-sm font-bold text-white uppercase tracking-tighter">Healthy Balance</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white uppercase tracking-tight">Recent Transactions</h2>
            <p className="text-xs text-slate-500 mt-1">{selectedAccount?.bank_name || 'Loading bank...'} - {selectedAccount?.account_name || ''}</p>
          </div>

          <div className="hidden fold-inner:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-800/50 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4 text-right">Balance</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4 text-slate-300 font-medium">{new Date(tx.transaction_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4"><p className="text-white font-bold">{tx.description}</p><p className="text-[10px] text-slate-500 uppercase font-mono">{tx.reference || ''}</p></td>
                    <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-800 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-700 uppercase tracking-tighter">{tx.category || 'General'}</span></td>
                    <td className={`px-6 py-4 text-right font-black ${tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}</td>
                    <td className="px-6 py-4 text-right text-slate-500 font-mono">{tx.balance != null ? formatCurrency(tx.balance) : '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase ${tx.is_reconciled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{tx.is_reconciled ? 'Reconciled' : 'Unmatched'}</span>
                        {!tx.is_reconciled && tx.category === 'Gateway Payout' && (
                          <button onClick={() => handleStartReconciliation(tx)} className="text-[8px] font-black uppercase bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded transition-all">Match Orders</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fold-inner:hidden divide-y divide-slate-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="text-sm font-bold text-white truncate">{tx.description}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.reference || 'NO REF'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-black ${tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>{tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(tx.transaction_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[9px] font-black rounded border border-slate-700 uppercase tracking-widest">{tx.category || 'General'}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase border ${tx.is_reconciled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{tx.is_reconciled ? 'Reconciled' : 'Unmatched'}</span>
                </div>
              </div>
            ))}
          </div>

          {transactions.length === 0 && !isLoading && <div className="px-6 py-20 text-center text-slate-500 italic">No transactions found for this account.</div>}
        </div>
      </div>

      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-tight">Add Bank Account</h2>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Bank Name</label>
                <input type="text" value={newAccount.bank_name} onChange={(e) => setNewAccount({ ...newAccount, bank_name: e.target.value })} placeholder="e.g. Monzo, Starling" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500/50" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Account Friendly Name</label>
                <input type="text" value={newAccount.account_name} onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })} placeholder="e.g. Main Business Account" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500/50" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Linked Store (Optional)</label>
                <select value={newAccount.store_id} onChange={(e) => setNewAccount({ ...newAccount, store_id: e.target.value })} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none">
                  <option value="">Global Account (All Stores)</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddAccountOpen(false)} className="flex-1 py-3 bg-slate-800 text-slate-400 font-bold rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20">Create Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reconcilingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setReconcilingTx(null)} />
          <div className="relative bg-slate-900 border border-slate-700/60 rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <div><h2 className="text-xl font-black text-white uppercase tracking-tight">Reconcile Payout</h2><p className="text-xs text-slate-400 mt-1">{reconcilingTx.description} — {formatCurrency(reconcilingTx.amount)}</p></div>
              <button onClick={() => setReconcilingTx(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between items-center px-2"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available Orders (Unsettled)</p><p className="text-xs font-bold text-cyan-400">Total Selected: {formatCurrency(Array.from(selectedOrderIds).reduce((sum, id) => sum + (matchingOrders.find((order) => order.id === id)?.total || 0), 0))}</p></div>
              {matchingOrders.length === 0 ? <div className="py-12 text-center text-slate-500 italic bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">No matching orders found in this date range.</div> : <div className="space-y-2">{matchingOrders.map((order) => <button key={order.id} type="button" onClick={() => { const next = new Set(selectedOrderIds); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); setSelectedOrderIds(next); }} className={`w-full text-left p-4 rounded-2xl border transition-all flex justify-between items-center ${selectedOrderIds.has(order.id) ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}>
                <div className="flex items-center gap-4"><div className={`w-5 h-5 rounded-md border flex items-center justify-center ${selectedOrderIds.has(order.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'}`}>{selectedOrderIds.has(order.id) && <span className="text-white text-xs">✓</span>}</div><div><p className="text-sm font-bold text-white">{order.order_number}</p><p className="text-[10px] text-slate-500 uppercase">{order.customer_name} • {new Date(order.created_at).toLocaleDateString()}</p></div></div>
                <div className="text-right"><p className="text-sm font-black text-white">{formatCurrency(order.total)}</p><p className="text-[9px] text-rose-400 font-bold uppercase">Fee: {formatCurrency(order.gateway_fee_estimated || 0)}</p></div>
              </button>)}</div>}
            </div>
            <div className="p-6 border-t border-slate-800 flex gap-3">
              <button onClick={() => setReconcilingTx(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black uppercase tracking-widest rounded-xl">Cancel</button>
              <button onClick={handleReconcile} disabled={isReconciling || selectedOrderIds.size === 0} className="flex-[2] py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-widest rounded-xl disabled:opacity-50">{isReconciling ? 'Processing...' : 'Confirm Reconciliation'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
