'use client';

import { useState, useEffect } from 'react';
import { StoreService } from '@/lib/services/storeService';
import { Store } from '@/lib/types';
import BusinessIdentityPanel from './BusinessIdentityPanel';

export default function StoresSettingsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', max_display_stock: 50 });
  const [storeError, setStoreError] = useState<string | null>(null);

  useEffect(() => { loadStores(); }, []);

  const loadStores = async () => {
    setLoading(true);
    const data = await StoreService.getAllStores();
    setStores(data);
    setLoading(false);
  };

  const handleOpenModal = (store: Store | null = null) => {
    setStoreError(null);
    if (store) {
      setEditingStore(store);
      setFormData({ name: store.name, slug: store.slug, max_display_stock: store.max_display_stock || 50 });
    } else {
      setEditingStore(null);
      setFormData({ name: '', slug: '', max_display_stock: 50 });
    }
    setShowModal(true);
  };

  const handleNameChange = (name: string) => setFormData(prev => ({ ...prev, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreError(null);
    try {
      if (editingStore) await StoreService.updateStore(editingStore.id, formData);
      else await StoreService.createStore(formData);
      setShowModal(false);
      await loadStores();
    } catch (error: any) {
      console.error('[StoreSettings] save:', error);
      setStoreError(error?.message || 'Could not save store.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this store? This action may be irreversible if there are associated records.')) {
      try { await StoreService.deleteStore(id); await loadStores(); }
      catch { alert('Could not delete store. It might have active orders or products.'); }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-bold text-white">Stores</h2><p className="text-slate-400 text-sm">Manage storefront settings and legal business identity</p></div>
        <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">+ Add Store</button>
      </div>

      {loading ? <div className="text-center py-12"><div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div> :
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left"><thead><tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider"><th className="px-6 py-4">Store Name</th><th className="px-6 py-4">Slug / URL</th><th className="px-6 py-4">Business Identity</th><th className="px-6 py-4">Max Display Stock</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{stores.map(store => <tr key={store.id} className="hover:bg-slate-800/30 transition-colors">
            <td className="px-6 py-4"><div className="font-medium text-white">{store.name}</div><div className="text-xs text-slate-500">ID: {store.id.split('-')[0]}...</div></td>
            <td className="px-6 py-4 text-sm text-slate-400">/store/{store.slug}</td>
            <td className="px-6 py-4"><div className="text-sm text-slate-300">{store.domain || 'Domain not set'}</div><div className="text-[10px] text-slate-500">Edit a store to view business identity</div></td>
            <td className="px-6 py-4 text-sm text-slate-400">{store.max_display_stock || 'Unlimited'}</td>
            <td className="px-6 py-4 text-right space-x-3"><button onClick={() => handleOpenModal(store)} className="text-blue-400 hover:text-blue-300 text-sm font-medium">Edit</button><button onClick={() => handleDelete(store.id)} className="text-rose-400 hover:text-rose-300 text-sm font-medium">Delete</button></td>
          </tr>)}</tbody></table>
        </div>}

      {showModal && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-xl my-8">
          <div className="mb-5"><h3 className="text-lg font-bold text-white">{editingStore ? 'Edit Store' : 'Add Store'}</h3><p className="text-xs text-slate-500 mt-1">Store name, slug and display settings. Business Identity can be configured after the store exists.</p></div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-400 mb-1">Store Name</label><input type="text" required value={formData.name} onChange={e => handleNameChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
            <div><label className="block text-sm font-medium text-slate-400 mb-1">Slug</label><input type="text" required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
            <div><label className="block text-sm font-medium text-slate-400 mb-1">Max Display Stock</label><input type="number" value={formData.max_display_stock} onChange={e => setFormData({ ...formData, max_display_stock: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500" /><p className="text-[10px] text-slate-500 mt-1">Limits the stock quantity shown to customers even if actual stock is higher.</p></div>
            {storeError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{storeError}</div>}
            <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingStore ? 'Update' : 'Create'}</button></div>
          </form>
        </div>
      </div>}

      {editingStore && <div className="mt-8"><BusinessIdentityPanel storeId={editingStore.id} /></div>}
    </div>
  );
}
