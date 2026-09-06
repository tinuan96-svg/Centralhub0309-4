'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoreService } from '@/lib/services/storeService';
import { StoreStatsService, StoreStats } from '@/lib/services/storeStatsService';
import StoreCard from '@/components/StoreCard';
import DeleteStoreModal from '@/components/DeleteStoreModal';
import { PageHeader, designTokens } from '@/lib/design-system';
import { Store } from '@/lib/types';

export default function StoresPage({ params, searchParams }: { params: any; searchParams: any }) {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeStats, setStoreStats] = useState<Record<string, StoreStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; storeId: string | null; storeName: string }>({
    isOpen: false,
    storeId: null,
    storeName: '',
  });
  const [createModal, setCreateModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    setIsLoading(true);
    try {
      const storesData = await StoreService.getAllStores();
      setStores(storesData);

      const statsPromises = storesData.map(store =>
        StoreStatsService.getStoreStats(store.id)
      );
      const statsResults = await Promise.all(statsPromises);

      const statsMap: Record<string, StoreStats> = {};
      statsResults.forEach((stats, index) => {
        if (stats) {
          statsMap[storesData[index].id] = stats;
        }
      });
      setStoreStats(statsMap);
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStore = () => {
    setNewStoreName('');
    setNewStoreSlug('');
    setCreateError('');
    setCreateModal(true);
  };

  const handleNameChange = (name: string) => {
    setNewStoreName(name);
    setNewStoreSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim() || !newStoreSlug.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const store = await StoreService.createStore({ name: newStoreName.trim(), slug: newStoreSlug.trim() });
      setCreateModal(false);
      await loadStores();
      router.push(`/stores/${store.id}`);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create store');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteStore = (store: Store) => {
    setDeleteModal({
      isOpen: true,
      storeId: store.id,
      storeName: store.name,
    });
  };

  const handleCloseDeleteModal = () => {
    setDeleteModal({ isOpen: false, storeId: null, storeName: '' });
  };

  if (isLoading) {
    return (
      <div className={designTokens.spacing.page}>
        <div className={designTokens.layout.containerMax}>
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 mt-4">Loading stores...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="🏪"
          title="Store Management"
          subtitle="Manage and monitor all your stores from one place"
        />

        <div className={designTokens.spacing.section}>
        <div className="sticky top-14 md:static z-20 bg-slate-950/80 backdrop-blur-md md:bg-transparent -mx-6 px-6 py-4 border-b md:border-0 border-slate-800/50 flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 uppercase tracking-tighter">
              Active Stores ({stores.length})
            </h2>
            <p className="text-[10px] sm:text-sm text-slate-500 uppercase font-black tracking-widest mt-0.5">
              Multi-Store Network
            </p>
          </div>
          <button
            onClick={handleCreateStore}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </button>
        </div>

        {stores.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-12 text-center">
            <div className="text-6xl mb-4">🏪</div>
            <h3 className="text-xl font-semibold text-slate-200 mb-2">
              No stores yet
            </h3>
            <p className="text-slate-400 mb-6">
              Create your first store to start managing products and orders
            </p>
            <button
              onClick={handleCreateStore}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-all"
            >
              Create Your First Store
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stores.map((store) => {
                const stats = storeStats[store.id];
                if (!stats) {
                  return (
                    <div
                      key={store.id}
                      className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6"
                    >
                      <div className="flex items-center justify-center h-48">
                        <div className="text-center">
                          <div className="inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-slate-400 text-sm mt-2">Loading stats...</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return <StoreCard key={store.id} stats={stats} />;
              })}
            </div>
          )}
        </div>
      </div>

      {deleteModal.isOpen && deleteModal.storeId && (
        <DeleteStoreModal
          storeId={deleteModal.storeId}
          storeName={deleteModal.storeName}
          onClose={handleCloseDeleteModal}
          onSuccess={loadStores}
        />
      )}

      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">Create New Store</h2>
              <button onClick={() => setCreateModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmitCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Store Name</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Mallu Spices"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">URL Slug</label>
                <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-3 py-2.5 text-slate-500 text-sm border-r border-slate-700 select-none">store/</span>
                  <input
                    type="text"
                    value={newStoreSlug}
                    onChange={e => setNewStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="mallu-spices"
                    className="flex-1 px-3 py-2.5 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
              {createError && (
                <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{createError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newStoreName.trim() || !newStoreSlug.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating...</>
                  ) : 'Create Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
