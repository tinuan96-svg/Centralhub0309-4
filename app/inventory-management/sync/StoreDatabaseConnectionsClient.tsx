'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import StoreBadge from '@/components/StoreBadge';
import LiveIndicator from '@/components/LiveIndicator';

interface StoreRecord {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  visibility?: boolean | null;
  created_at?: string | null;
}

const DIRECT_STORE_CONFIG: Record<string, { label: string; target: string }> = {
  malluspices: { label: 'MalluSpices', target: 'MalluSpices Supabase database' },
  pocketgrocery: { label: 'PocketGrocery', target: 'PocketGrocery Supabase database' },
  keralagrocery: { label: 'KeralaGroceries', target: 'KeralaGroceries Supabase database' },
  keralagroceries: { label: 'KeralaGroceries', target: 'KeralaGroceries Supabase database' },
  tamilretail: { label: 'TamilRetail', target: 'TamilRetail Supabase database' },
};

export default function StoreDatabaseConnectionsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from('stores')
      .select('id, name, slug, domain, visibility, created_at')
      .order('name');

    if (!error) {
      setStores(data || []);
      setLastUpdated(new Date());
    } else {
      console.error('Failed to load stores:', error);
      setStores([]);
      setLoadError(error.message || 'Unable to load the CentralHub stores registry.');
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Store Database Connections</h1>
          <p className="text-sm text-slate-500 mt-1">
            CentralHub connects directly to each store database. The legacy product-sync queue is no longer used.
          </p>
        </div>
        <LiveIndicator isLive={true} lastUpdated={lastUpdated} />
      </div>

      <div className="bg-slate-900/50 border border-cyan-500/20 rounded-3xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">🔗</div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Direct-store architecture</h2>
            <p className="text-sm text-slate-400 mt-2 leading-6">
              Product operations are performed against the selected store&apos;s own Supabase database. There is no central product-sync counter, queue, or scheduled bulk sync represented here.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6">
          <div className="text-sm font-black uppercase tracking-widest text-red-300">Store registry could not be loaded</div>
          <p className="text-sm text-red-200/80 mt-2 break-words">{loadError}</p>
          <p className="text-xs text-slate-500 mt-3">
            This page reads the CentralHub stores registry only. It does not create or run a legacy product sync.
          </p>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-400">Loading store connections...</div>
      ) : stores.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center">
          <span className="text-4xl mb-4 block opacity-20">🏪</span>
          <p className="text-slate-400">
            {loadError ? 'The store registry could not be read.' : 'The CentralHub stores registry returned no stores.'}
          </p>
          <p className="text-xs text-slate-600 mt-2">
            No database connection is inferred or fabricated from this empty result.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {stores.map((store) => {
            const config = DIRECT_STORE_CONFIG[store.slug?.toLowerCase()];
            const configured = Boolean(config);

            return (
              <div key={store.id} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all">
                <div className="flex items-center justify-between mb-6">
                  <StoreBadge store={store} size="md" />
                  <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${configured ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    {configured ? 'Direct DB' : 'Needs Mapping'}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-500 font-medium">Connection mode</span>
                    <span className="text-slate-200 font-semibold text-right">Direct Supabase</span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-500 font-medium">Database target</span>
                    <span className="text-slate-200 font-semibold text-right">{config?.target || 'Not mapped'}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-500 font-medium">Store slug</span>
                    <span className="text-slate-300 font-mono text-xs">{store.slug}</span>
                  </div>
                  {store.domain && (
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-slate-500 font-medium">Store domain</span>
                      <span className="text-slate-300 text-xs text-right break-all">{store.domain}</span>
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800">
                  <div className="text-[10px] uppercase tracking-widest text-slate-600">
                    Credentials remain server-side and are never exposed in this UI.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={loadStores}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
        >
          Refresh Connections
        </button>
      </div>
    </div>
  );
}
