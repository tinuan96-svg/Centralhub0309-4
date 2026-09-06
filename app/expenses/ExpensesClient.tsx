'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { expenseService, Expense, EXPENSE_CATEGORIES } from '@/lib/services/expenseService';
import { StoreService } from '@/lib/services/storeService';
import { Store } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/currency';
import SkeletonLoader from '@/components/SkeletonLoader';

export default function ExpensesPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const router = useRouter();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expData, storesData] = await Promise.all([
        expenseService.getAllExpenses({
          status: filterStatus,
          category: filterCategory,
          storeId: filterStore
        }),
        StoreService.getAllStores()
      ]);
      setExpenses(expData);
      setStores(storesData);
    } catch (err) {
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, filterStore]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    return {
      total: expenses.reduce((sum, e) => sum + e.amount, 0),
      paid: expenses.filter(e => e.payment_status === 'paid').reduce((sum, e) => sum + e.amount, 0),
      pending: expenses.filter(e => e.payment_status === 'pending' || e.payment_status === 'unpaid').reduce((sum, e) => sum + e.amount, 0),
      count: expenses.length
    };
  }, [expenses]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter">Business Expenses</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Track operational costs and overheads</p>
        </div>
        <Link
          href="/expenses/new"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-900/30 transition-all active:scale-95"
        >
          + Record Expense
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Period Expenses</p>
           <p className="text-3xl font-black text-white">{formatCurrency(summary.total)}</p>
           <p className="text-[10px] text-slate-600 font-bold uppercase mt-2">{summary.count} Records</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Paid</p>
           <p className="text-3xl font-black text-emerald-400">{formatCurrency(summary.paid)}</p>
           <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${(summary.paid / (summary.total || 1)) * 100}%` }}></div>
           </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Outstanding / Unpaid</p>
           <p className="text-3xl font-black text-amber-400">{formatCurrency(summary.pending)}</p>
           <p className="text-[10px] text-slate-600 font-bold uppercase mt-2">Requires Attention</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl">
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Status</label>
               <select
                 value={filterStatus}
                 onChange={e => setFilterStatus(e.target.value)}
                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
               >
                 <option value="all">All Statuses</option>
                 <option value="paid">Paid</option>
                 <option value="pending">Pending/Unpaid</option>
                 <option value="cancelled">Cancelled</option>
               </select>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Category</label>
               <select
                 value={filterCategory}
                 onChange={e => setFilterCategory(e.target.value)}
                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
               >
                 <option value="all">All Categories</option>
                 {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Store Allocation</label>
               <select
                 value={filterStore}
                 onChange={e => setFilterStore(e.target.value)}
                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
               >
                 <option value="all">All Allocations</option>
                 <option value="null">Global (Business-wide)</option>
                 {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
            </div>
         </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
         {loading ? (
            <div className="p-8"><SkeletonLoader variant="list" count={5} /></div>
         ) : expenses.length === 0 ? (
            <div className="p-20 text-center space-y-4">
               <span className="text-5xl">📄</span>
               <p className="text-slate-500 font-bold uppercase tracking-widest">No expense records found</p>
               <button onClick={() => {setFilterStatus('all'); setFilterCategory('all'); setFilterStore('all');}} className="text-emerald-400 text-xs font-black uppercase underline">Clear all filters</button>
            </div>
         ) : (
            <div className="overflow-x-auto">
               <table className="w-full text-sm">
                  <thead className="bg-slate-800/50 border-b border-slate-700/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                     <tr>
                        <th className="px-6 py-5 text-left">Date</th>
                        <th className="px-6 py-5 text-left">Description</th>
                        <th className="px-6 py-5 text-left">Category</th>
                        <th className="px-6 py-5 text-left">Allocation</th>
                        <th className="px-6 py-5 text-right">Amount</th>
                        <th className="px-6 py-5 text-center">Status</th>
                        <th className="px-6 py-5 text-right">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                     {expenses.map((exp) => (
                        <tr
                          key={exp.id}
                          className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                          onClick={() => router.push(`/expenses/${exp.id}`)}
                        >
                           <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-medium">
                              {new Date(exp.expense_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                           </td>
                           <td className="px-6 py-4">
                              <p className="font-bold text-slate-100">{exp.description}</p>
                              {exp.notes && <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{exp.notes}</p>}
                           </td>
                           <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-slate-800 text-slate-400 text-[9px] font-black uppercase rounded-lg border border-slate-700 tracking-tighter">
                                 {exp.category}
                              </span>
                           </td>
                           <td className="px-6 py-4">
                              <span className="text-xs text-slate-400 font-bold">{exp.store_name}</span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <p className="text-lg font-black text-white">{formatCurrency(exp.amount)}</p>
                           </td>
                           <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase border ${
                                 exp.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                 exp.payment_status === 'cancelled' ? 'bg-slate-800 text-slate-500 border-slate-700' :
                                 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                 {exp.payment_status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <button className="p-2 text-slate-500 hover:text-white transition-colors">
                                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </div>
    </div>
  );
}
