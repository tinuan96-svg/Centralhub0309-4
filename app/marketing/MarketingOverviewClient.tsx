'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, StatCard, Button } from '@/lib/design-system';
import { useStore } from '@/lib/store/useStore';
import { marketingService } from '@/lib/services/marketing/marketingService';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

const IMPLEMENTATION_MODULES = [
  { name: 'Meta Ads & Assets', status: 'Live', href: '/marketing/integrations', icon: '📸', detail: 'OAuth • ad accounts • campaigns • Insights' },
  { name: 'Google Ads', status: 'Live', href: '/marketing/integrations', icon: '🔍', detail: 'OAuth • customers • campaigns • metrics' },
  { name: 'Google Analytics 4', status: 'Live', href: '/marketing/integrations', icon: '📊', detail: 'Properties • users • sessions • events • revenue' },
  { name: 'Merchant Center', status: 'Live', href: '/marketing/integrations', icon: '🛍️', detail: 'Accounts • product performance • clicks • impressions' },
  { name: 'Store-scoped OAuth', status: 'Live', href: '/marketing/integrations', icon: '🔐', detail: 'Per-store authorization • encrypted credentials' },
  { name: 'Marketing Sync', status: 'Live', href: '/marketing/reports', icon: '🔄', detail: 'Historical metrics • sync status • error handling' },
];

export default function MarketingOverviewClient({ params, searchParams }: { params: any; searchParams: any }) {
  const { stores } = useStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [marketingReserve, setMarketingReserve] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiData, insightData, reserveData] = await Promise.all([
        marketingService.getMarketingKPIs(selectedStoreId || undefined),
        marketingService.getInsights(selectedStoreId || undefined),
        supabase.from('v_marketing_reserve_dashboard').select('*').single(),
      ]);
      setKpis(kpiData); setInsights(insightData); setMarketingReserve(reserveData.data || null);
    } catch (err) { console.error('Failed to load marketing data:', err); }
    finally { setLoading(false); }
  }, [selectedStoreId]);

  useEffect(() => { loadData(); }, [loadData]);
  const selectedStore = stores.find(s => s.id === selectedStoreId);
  const QUICK_ACTIONS = [
    ['Campaigns', '/marketing/campaigns', '📣'], ['Integrations', '/marketing/integrations', '🔌'], ['Tracking', '/marketing/tracking', '🎯'],
    ['Feeds', '/marketing/product-feeds', '📦'], ['Budgets', '/marketing/budgets', '💰'], ['Audiences', '/marketing/segments', '👥'],
    ['Creative', '/marketing/creative-library', '🎨'], ['Reports', '/marketing/reports', '📄'], ['WhatsApp', '/marketing/whatsapp', '💬'],
    ['Email', '/marketing/email', '✉️'], ['Social', '/marketing/social', '📱'], ['AI Marketing', '/marketing/ai', '✨'],
  ];

  return <div className="p-4 sm:p-6 space-y-8 lg:space-y-10 pb-32">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6"><PageHeader title="Marketing OS" subtitle={selectedStore ? `Command Center: ${selectedStore.name}` : 'Global Marketing Performance Control'} /><div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-xl"><StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} /></div></div>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-3">{QUICK_ACTIONS.map(([label, href, icon]) => <Link key={href} href={href} className="group"><Card className="p-3 min-h-[82px] bg-slate-900/40 border-slate-800 flex flex-col items-center justify-center gap-2 hover:border-blue-500/30 transition-all"><span className="text-xl">{icon}</span><span className="text-[9px] text-center font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300">{label}</span></Card></Link>)}</div>

    <Card className="p-5 sm:p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Implementation status</p><h2 className="text-xl font-black text-white uppercase tracking-tight mt-1">Live marketing capabilities</h2><p className="text-xs text-slate-500 mt-2">Backend integrations are surfaced here so the dashboard does not hide functionality behind empty pages. Connection state still comes from the selected store.</p></div><Link href="/marketing/integrations"><Button variant="secondary" className="text-[10px] font-black uppercase tracking-widest">Manage Connections</Button></Link></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">{IMPLEMENTATION_MODULES.map(module => <Link key={module.name} href={module.href} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 hover:border-blue-500/30 transition-all"><div className="flex items-start justify-between gap-3"><span className="text-2xl">{module.icon}</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-300">{module.status}</span></div><h3 className="text-xs font-black uppercase text-white mt-4">{module.name}</h3><p className="text-[10px] text-slate-500 mt-2">{module.detail}</p></Link>)}</div></Card>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6"><StatCard label="Total Marketing Spend" value={`£${((kpis?.spend || 0) / 100).toFixed(2)}`} icon="💰" variant="glass"/><StatCard label="Marketing Reserve Available" value={formatCurrency(marketingReserve?.available_total || 0)} icon="📣" variant="glass"/><StatCard label="Reserve Allocated Total" value={formatCurrency(marketingReserve?.allocated_total || 0)} icon="🏦" variant="glass"/><StatCard label="Attributed Revenue" value={`£${((kpis?.revenue || 0) / 100).toFixed(2)}`} icon="📈" variant="glass"/><StatCard label="Average ROAS" value={`${kpis?.roas || '0.00'}x`} icon="🎯" variant="glass"/></div>

    <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-lg font-black text-white uppercase">Marketing Reserve</h2><p className="text-xs text-slate-500 mt-1">5% of reconciled sales receipts, available for all marketing activities.</p></div><Link href="/finance/reserves"><Button variant="secondary">Open Reserve Control</Button></Link></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6"><div className="rounded-2xl bg-slate-950/60 p-5"><p className="text-[10px] uppercase tracking-widest text-slate-500">Available</p><p className="text-2xl font-black text-emerald-300 mt-2">{formatCurrency(marketingReserve?.available_total || 0)}</p></div><div className="rounded-2xl bg-slate-950/60 p-5"><p className="text-[10px] uppercase tracking-widest text-slate-500">Allocated This Month</p><p className="text-2xl font-black text-white mt-2">{formatCurrency(marketingReserve?.allocated_this_month || 0)}</p></div><div className="rounded-2xl bg-slate-950/60 p-5"><p className="text-[10px] uppercase tracking-widest text-slate-500">Spent</p><p className="text-2xl font-black text-white mt-2">{formatCurrency(marketingReserve?.spent_total || 0)}</p></div></div></Card>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><Card className="lg:col-span-1 p-8 bg-slate-900/40 border-slate-800 rounded-[2.5rem]"><h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Attention Required</h3>{loading ? <p className="py-10 text-center text-slate-500 text-xs">Loading marketing health…</p> : insights.length === 0 ? <p className="py-10 text-center text-slate-500 text-xs">System Healthy • No Alerts</p> : insights.slice(0, 5).map(i => <div key={i.id} className="p-4 border-b border-slate-800"><p className="text-xs font-black text-white">{i.title}</p><p className="text-xs text-slate-500 mt-1">{i.description}</p></div>)}</Card><Card className="lg:col-span-2 p-8 bg-slate-900/40 border-slate-800 rounded-[2.5rem]"><h3 className="text-xl font-black text-white uppercase tracking-tighter mb-8">Marketing Planning</h3><p className="text-sm text-slate-400">Use the available Marketing Reserve as the spending ceiling across campaigns, advertising, creators, WhatsApp, email, promotions and other marketing activities. Reserve funds are based on reconciled bank receipts, not pending orders.</p></Card></div>
  </div>;
}
