'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { invoiceService, SupplierInvoice, InvoiceSummary } from '@/lib/services/invoiceService';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-400',
  received: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-cyan-500/20 text-cyan-400',
  paid: 'bg-green-500/20 text-green-400',
  disputed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-slate-600/20 text-slate-500',
};

export default function SupplierInvoicesClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const [data, sum] = await Promise.all([
      invoiceService.getAllInvoices(statusFilter),
      invoiceService.getSummary(),
    ]);
    setInvoices(data);
    setSummary(sum);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const isOverdue = (dueDate: string | null, status: string) => {
    if (!dueDate || status === 'paid' || status === 'cancelled' || status === 'draft') return false;
    return dueDate < new Date().toISOString().split('T')[0];
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Supplier Invoices</h1>
          <p className="text-slate-400">Receive, approve, and pay supplier invoices</p>
        </div>
        <Link
          href="/suppliers/invoices/new"
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
        >
          + New Invoice
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Outstanding</p>
            <p className="text-2xl sm:text-3xl font-bold text-cyan-400">{formatCurrency(summary.total_outstanding)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Overdue</p>
            <p className="text-2xl sm:text-3xl font-bold text-red-400">{formatCurrency(summary.total_overdue)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Total Paid</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-400">{formatCurrency(summary.total_paid)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 sm:p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Disputed</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-400">{summary.count_disputed}</p>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {['all', 'draft', 'received', 'approved', 'paid', 'disputed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {s === 'all' ? 'All Invoices' : s}
            {summary && s !== 'all' && (
              <span className="ml-1.5 text-slate-500">
                {s === 'draft' ? summary.count_draft :
                 s === 'received' ? summary.count_received :
                 s === 'approved' ? summary.count_approved :
                 s === 'paid' ? summary.count_paid :
                 s === 'disputed' ? summary.count_disputed : 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4">Loading invoices...</p>
        </div>
      ) : invoices.length > 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700 bg-slate-900/50">
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-3 py-3 font-medium">Supplier</th>
                <th className="px-3 py-3 font-medium text-center">Date</th>
                <th className="px-3 py-3 font-medium text-center">Due</th>
                <th className="px-3 py-3 font-medium text-right">Total</th>
                <th className="px-3 py-3 font-medium text-right">Outstanding</th>
                <th className="px-3 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const outstanding = inv.total_amount - inv.amount_paid;
                const overdue = isOverdue(inv.due_date, inv.status);
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/suppliers/invoices/${inv.id}`}
                  >
                    <td className="px-4 py-3 text-white font-medium">{inv.invoice_number}</td>
                    <td className="px-3 py-3 text-slate-300">{inv.supplier_name}</td>
                    <td className="px-3 py-3 text-center text-slate-300">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {inv.due_date ? (
                        <span className={overdue ? 'text-red-400 font-medium' : 'text-slate-300'}>
                          {new Date(inv.due_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-white font-semibold">
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={outstanding > 0 ? 'text-amber-400' : 'text-green-400'}>
                        {formatCurrency(outstanding, inv.currency)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[inv.status] || STATUS_COLORS.draft}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 flex flex-col items-center justify-center text-center">
          <span className="text-5xl mb-4">🧾</span>
          <h2 className="text-lg font-bold text-slate-200 mb-2">No Invoices Found</h2>
          <p className="text-sm text-slate-500 max-w-md mb-4">
            Create your first supplier invoice to start tracking costs, receiving goods, and managing payments.
          </p>
          <Link
            href="/suppliers/invoices/new"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            + New Invoice
          </Link>
        </div>
      )}
    </div>
  );
}
