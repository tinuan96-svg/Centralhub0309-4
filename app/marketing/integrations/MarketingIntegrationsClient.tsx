'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button } from '@/lib/design-system';
import { marketingService } from '@/lib/services/marketing/marketingService';
import { Badge } from '@/lib/design-system/components/Badge';
import { MarketingConnection, MarketingProvider } from '@/lib/types/marketing';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import MarketingConnectionModal from '@/components/MarketingConnectionModal';
import Link from 'next/link';

const LIVE_PROVIDER_IDS = new Set(['meta', 'google']);
const CONNECTED_STATUSES = new Set(['connected', 'healthy', 'syncing', 'warning']);

const LIVE_IMPLEMENTATIONS = [
  { id: 'google-ads', providerId: 'google', name: 'Google Ads', icon: '🔍', description: 'OAuth, developer-token configuration, customer discovery, campaigns and 30-day performance metrics.', metrics: 'Spend • Impressions • Clicks • Conversions • Conversion value • ROAS' },
  { id: 'ga4', providerId: 'google', name: 'Google Analytics 4', icon: '📊', description: 'Store-scoped OAuth access, property discovery and historical traffic/event reporting.', metrics: 'Users • Sessions • Events • Conversions • Revenue' },
  { id: 'merchant-center', providerId: 'google', name: 'Google Merchant Center', icon: '🛍️', description: 'Store-scoped Merchant account discovery and product-performance reporting.', metrics: 'Products • Clicks • Impressions • CTR • Account status' },
  { id: 'meta', providerId: 'meta', name: 'Meta Ads & Assets', icon: '📸', description: 'Store-scoped Meta authorization, ad-account discovery, campaigns and Insights reporting.', metrics: 'Spend • Reach • Impressions • Clicks • Leads/Purchases • ROAS' },
];

export default function MarketingIntegrations({ searchParams }: { params?: any; searchParams: any }) {
  const { selectedStoreId, setSelectedStoreId } = useDashboardFilterStore();
  const [providers, setProviders] = useState<MarketingProvider[]>([]);
  const [connections, setConnections] = useState<MarketingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(searchParams?.category || 'all');
  const [selectedProvider, setSelectedProvider] = useState<MarketingProvider | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<MarketingConnection | null>(null);

  useEffect(() => { if (searchParams?.category) setActiveCategory(searchParams.category); }, [searchParams?.category]);
  useEffect(() => { loadData(); }, [selectedStoreId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        marketingService.getProviders(),
        marketingService.getConnections(selectedStoreId === 'all' ? undefined : selectedStoreId),
      ]);
      setProviders(p); setConnections(c);
    } catch (err) { console.error('Failed to load marketing data:', err); }
    finally { setLoading(false); }
  };

  const categories = [
    { id: 'all', label: 'All Platforms' }, { id: 'advertising', label: 'Advertising' }, { id: 'social', label: 'Social Media' },
    { id: 'search', label: 'Search & SEO' }, { id: 'commerce', label: 'Commerce' }, { id: 'messaging', label: 'Messaging' },
    { id: 'email', label: 'Email' }, { id: 'analytics', label: 'Analytics' },
  ];

  const filteredProviders = providers.filter(provider => {
    const matchesSearch = provider.display_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || provider.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const openProvider = (provider: MarketingProvider, connection?: MarketingConnection) => {
    if (selectedStoreId === 'all' || !LIVE_PROVIDER_IDS.has(provider.id)) return;
    setSelectedConnection(connection || null); setSelectedProvider(provider);
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 pb-24">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <PageHeader title="Marketing OS Integrations" subtitle="Authorize and manage connections for each store independently." />
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-xl"><StoreScopeSelector value={selectedStoreId === 'all' ? null : selectedStoreId} onStoreChange={id => setSelectedStoreId(id || 'all')} /></div>
      </div>

      <Card className="p-5 sm:p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Live implementation coverage</p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight mt-1">What CentralHub can actually manage</h2>
            <p className="text-xs text-slate-500 mt-2 max-w-3xl">These modules are backed by server-side OAuth, API adapters and sync/reporting logic. Available does not mean connected: the selected store still needs its own external authorization.</p>
          </div>
          <Link href="/marketing/reports" className="shrink-0"><Button variant="secondary" className="text-[10px] font-black uppercase tracking-widest">Open Reporting</Button></Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          {LIVE_IMPLEMENTATIONS.map(item => {
            const connection = connections.find(c => c.provider_id === item.providerId);
            const connected = !!connection && CONNECTED_STATUSES.has(connection.status);
            return <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col min-h-[190px]">
              <div className="flex items-start justify-between gap-3"><span className="text-2xl">{item.icon}</span><Badge variant={connected ? 'success' : 'info'}>{connected ? 'Connected' : 'Available'}</Badge></div>
              <h3 className="text-sm font-black text-white uppercase mt-4">{item.name}</h3>
              <p className="text-[10px] leading-relaxed text-slate-500 mt-2 flex-1">{item.description}</p>
              <p className="text-[9px] font-bold uppercase tracking-tight text-slate-400 mt-3">{item.metrics}</p>
            </div>;
          })}
        </div>
      </Card>

      {selectedStoreId === 'all' && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-slate-300"><strong className="text-white">All Stores view:</strong> connections are aggregated for visibility only. Select one store before connecting or managing a platform so credentials and external assets remain store-scoped.</div>}

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/40 border border-slate-800/50 p-2 rounded-2xl">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1">{categories.map(category => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === category.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>{category.label}</button>)}</div>
        <div className="relative w-full md:w-64 px-1"><input type="text" placeholder="Search platforms..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProviders.map(provider => {
          const storeConnections = connections.filter(connection => connection.provider_id === provider.id);
          const isImplemented = LIVE_PROVIDER_IDS.has(provider.id);
          const connection = storeConnections[0];
          const isConnected = isImplemented && !!connection && CONNECTED_STATUSES.has(connection.status);
          let statusText = isImplemented ? 'Not Connected' : 'Coming Soon';
          let statusVariant: 'info' | 'success' | 'warning' | 'error' = 'info';
          if (isImplemented && connection) {
            statusText = connection.status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            statusVariant = CONNECTED_STATUSES.has(connection.status) ? (connection.status === 'warning' ? 'warning' : 'success') : connection.status === 'error' ? 'error' : 'warning';
          }
          if (selectedStoreId === 'all' && isImplemented) {
            const connectedCount = storeConnections.filter(item => CONNECTED_STATUSES.has(item.status)).length;
            statusText = connectedCount > 0 ? `${connectedCount} Store${connectedCount > 1 ? 's' : ''} Connected` : 'No Stores Connected';
            statusVariant = connectedCount > 0 ? 'success' : 'info';
          }
          return <Card key={provider.id} className="p-6 bg-slate-900/40 border-slate-800 flex flex-col justify-between group hover:border-blue-500/30 transition-all">
            <div><div className="flex justify-between items-start mb-4"><div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-inner border border-slate-700/50">{provider.icon || '🔌'}</div><Badge variant={statusVariant}>{statusText}</Badge></div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">{provider.display_name}</h3>
              <div className="flex flex-wrap gap-1 mb-4">{provider.capabilities.slice(0, 4).map(capability => <span key={capability} className="text-[8px] font-black uppercase text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{capability.replaceAll('_', ' ')}</span>)}</div>
              {connection?.external_account_name && selectedStoreId !== 'all' && isImplemented && <p className="text-[10px] text-slate-500 truncate" title={connection.external_account_name}>Account: <span className="text-slate-300">{connection.external_account_name}</span></p>}
            </div>
            <div className="space-y-3 mt-5"><Button variant={isConnected ? 'secondary' : 'primary'} className="w-full text-[10px] font-black uppercase tracking-widest py-2.5" disabled={selectedStoreId === 'all' || !isImplemented} onClick={() => openProvider(provider, connection)}>{selectedStoreId === 'all' ? 'Select Store' : !isImplemented ? 'Coming Soon' : (isConnected ? 'Manage Connection' : 'Connect')}</Button>
              {isConnected && selectedStoreId !== 'all' && <div className="flex items-center justify-between px-1"><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /><span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Live Sync</span></div><span className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter">Score: {connection?.health_score ?? '—'}%</span></div>}
            </div>
          </Card>;
        })}
      </div>

      {filteredProviders.length === 0 && !loading && <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[2.5rem]"><p className="text-slate-500 font-black uppercase tracking-widest text-xs">No matching platforms found</p><Button variant="secondary" className="mt-4 text-[10px]" onClick={() => { setSearchTerm(''); setActiveCategory('all'); }}>Clear All Filters</Button></div>}
      {selectedProvider && selectedStoreId !== 'all' && <MarketingConnectionModal provider={selectedProvider} storeId={selectedStoreId} connection={selectedConnection} onClose={() => { setSelectedProvider(null); setSelectedConnection(null); loadData(); }} onSuccess={() => { setSelectedProvider(null); setSelectedConnection(null); loadData(); }} />}
    </div>
  );
}
