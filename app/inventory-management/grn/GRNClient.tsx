'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/currency';

export default function GRNClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('supplier_invoices')
      .select('*, suppliers(name)')
      .order('created_at', { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Goods Received (GRN)</h1>
          <p className="text-sm text-slate-500 mt-1">Verify and receive incoming stock deliveries</p>
        </div>
        <Link
          href="/inventory-management/grn/new"
          className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20"
        >
          + New Delivery (Scan)
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4">
           <span className="text-5xl">🚚</span>
           <div className="max-w-md">
              <h2 className="text-lg font-bold text-slate-200">No Pending Deliveries</h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">Incoming shipments from suppliers will appear here for verification and stock entry.</p>
           </div>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
           <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                 <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4 text-right">Total Amount</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                 {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                       <td className="px-6 py-4 text-slate-300 font-mono">{new Date(inv.invoice_date).toLocaleDateString('en-GB')}</td>
                       <td className="px-6 py-4 text-white font-bold">{inv.invoice_number}</td>
                       <td className="px-6 py-4 text-slate-300">{inv.suppliers?.name}</td>
                       <td className="px-6 py-4 text-right font-bold text-cyan-400">{formatCurrency(inv.total_amount)}</td>
                       <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                             inv.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                             inv.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                             'bg-amber-500/10 text-amber-400'
                          }`}>
                             {inv.status}
                          </span>
                       </td>
                       <td className="px-6 py-4 text-right">
                          <Link href={`/inventory-management/grn/${inv.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold uppercase tracking-wider">Details →</Link>
                       </td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      )}
    </div>
  );
}
