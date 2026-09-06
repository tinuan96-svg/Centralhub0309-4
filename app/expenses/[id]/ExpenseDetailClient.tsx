'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { expenseService, Expense, EXPENSE_CATEGORIES } from '@/lib/services/expenseService';
import { StoreService } from '@/lib/services/storeService';
import { Store } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export default function ExpenseDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const isNew = id === 'new';

  const [expense, setExpense] = useState<Expense | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Partial<Expense>>({
    description: '',
    amount: 0,
    category: 'Other',
    expense_date: new Date().toISOString().split('T')[0],
    payment_status: 'pending',
    payment_method: 'Bank Transfer',
    notes: '',
    store_id: null,
  });

  const loadData = useCallback(async () => {
    if (!id || id === '__placeholder') {
       setLoading(false);
       return;
    }
    setLoading(true);
    try {
      const [storesData, expenseData] = await Promise.all([
        StoreService.getAllStores(),
        isNew ? Promise.resolve(null) : expenseService.getExpenseById(id)
      ]);

      setStores(storesData);
      if (expenseData) {
        setExpense(expenseData);
        setForm(expenseData);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);

    if (isNew) {
      const newId = await expenseService.createExpense(form);
      if (newId) router.push('/expenses');
      else alert('Failed to create expense');
    } else {
      const success = await expenseService.updateExpense(id, form);
      if (success) {
        setSaving(false);
        loadData();
      } else {
        alert('Failed to update expense');
      }
    }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isNew || !expense) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `expense_${expense.id}_${Date.now()}.${fileExt}`;
      const filePath = `invoices/${fileName}`; // Re-using the invoices bucket

      const { data, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      const success = await expenseService.updateExpense(expense.id, { file_url: publicUrl });
      if (success) loadData();
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!expense) return;
    if (!confirm('Delete this expense record?')) return;
    const success = await expenseService.deleteExpense(expense.id);
    if (success) router.push('/expenses');
  };

  if (loading && id !== '__placeholder') {
    return (
      <div className="p-12 text-center">
        <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 mt-4 font-bold uppercase tracking-widest text-xs">Loading Expense...</p>
      </div>
    );
  }

  if (id === '__placeholder') {
     return <div className="p-12 text-center text-slate-500">Placeholder</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link href="/expenses" className="text-sm text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2">
          <span>←</span> Back to Expenses
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter">
            {isNew ? 'Record Expense' : 'Expense Details'}
          </h1>
          {!isNew && <p className="text-slate-500 text-sm font-mono mt-1">{id}</p>}
        </div>
        {!isNew && (
           <div className="flex gap-2 w-full sm:w-auto">
             <button
               onClick={() => fileInputRef.current?.click()}
               disabled={uploading}
               className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-widest border border-slate-700 transition-all flex items-center justify-center gap-2"
             >
               {uploading ? '...' : expense?.file_url ? 'Update Receipt' : 'Upload Receipt'}
             </button>
             <button
               onClick={handleDelete}
               className="flex-1 sm:flex-none px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest border border-rose-500/20 transition-all"
             >
               Delete
             </button>
           </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,image/*"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="space-y-4">
              <label className="block">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Description</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Monthly Warehouse Rent"
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-bold"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Store Allocation</span>
                  <select
                    value={form.store_id || ''}
                    onChange={e => setForm({ ...form, store_id: e.target.value || null })}
                    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-bold"
                  >
                    <option value="">Global (Entire Business)</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Category</span>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-bold"
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Date</span>
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={e => setForm({ ...form, expense_date: e.target.value })}
                    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-bold"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Payment Status</span>
                  <select
                    value={form.payment_status}
                    onChange={e => setForm({ ...form, payment_status: e.target.value as any })}
                    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-bold"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Internal Notes</span>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all resize-none"
                />
              </label>
            </div>

            <div className="pt-4 flex gap-4">
               <button
                 onClick={() => router.push('/expenses')}
                 className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black uppercase tracking-widest rounded-2xl transition-all"
               >
                 Cancel
               </button>
               <button
                 onClick={handleSave}
                 disabled={saving || !form.description || !form.amount}
                 className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-900/20"
               >
                 {saving ? 'Saving...' : isNew ? 'Record Expense' : 'Update Expense'}
               </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Amount</span>
             <div className="mt-2 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-500">£</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-10 pr-4 py-4 text-3xl font-black text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
                />
             </div>
          </div>

          {!isNew && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Evidence / Receipt</span>
               <div className="mt-4">
                  {expense?.file_url ? (
                    <div className="space-y-4">
                       <div className="aspect-[4/3] bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-center overflow-hidden group relative">
                          {expense.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                             <img src={expense.file_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Receipt" />
                          ) : (
                             <span className="text-4xl">📄</span>
                          )}
                          <a
                            href={expense.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                          >
                             <span className="px-4 py-2 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest">Open Full File</span>
                          </a>
                       </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-[4/3] border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all"
                    >
                       <span className="text-2xl mb-2">📸</span>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Click to Upload</p>
                    </div>
                  )}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
