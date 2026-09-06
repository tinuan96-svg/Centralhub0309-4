'use client';

import {
  PageHeader,
  Card,
  CardContent,
  StatGrid,
  Badge,
  Button,
  SectionHeader,
  designTokens
} from '@/lib/design-system';

const platforms = [
  { name: 'Google Merchant Center', count: '1,240', status: 'Synced', variant: 'success' as const, icon: '🔍' },
  { name: 'Meta Catalog', count: '1,240', status: 'Synced', variant: 'success' as const, icon: '👥' },
  { name: 'TikTok Catalog', count: '850', status: 'Pending', variant: 'pending' as const, icon: '🎵' },
  { name: 'Pinterest Catalog', count: '1,100', status: 'Error', variant: 'failed' as const, icon: '📌' },
];

const commonErrors = [
  { id: 1, message: 'Missing GTIN (Global Trade Item Number)', count: 12, impact: 'High' },
  { id: 2, message: 'Low Quality Image (Resolution below 250px)', count: 8, impact: 'Medium' },
  { id: 3, message: 'Missing Description field', count: 5, impact: 'Medium' },
  { id: 4, message: 'Price Mismatch (Store vs. Feed)', count: 3, impact: 'Critical' },
];

export default function ProductFeedsClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-10 bg-[#0D1117] min-h-screen">
      <PageHeader
        title="Product Feed Engine"
        subtitle="Master command center for multi-channel product catalog synchronization and optimization."
        icon="🚀"
      />

      {/* Product Health Dashboard */}
      <section className="space-y-4">
        <SectionHeader title="Product Health Summary" subtitle="Total inventory health across all connected marketing channels." />
        <StatGrid columns={3}>
          <Card className="border-[#2EA043]/30 bg-[#2EA043]/5">
            <CardContent className="flex flex-col items-center text-center py-8">
              <div className="w-12 h-12 rounded-full bg-[#2EA043]/20 flex items-center justify-center text-[#2EA043] mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className={designTokens.typography.metricLabel}>Active Items</p>
              <p className="text-4xl font-bold text-[#2EA043] mt-1">3,240</p>
            </CardContent>
          </Card>

          <Card className="border-[#FFC107]/30 bg-[#FFC107]/5">
            <CardContent className="flex flex-col items-center text-center py-8">
              <div className="w-12 h-12 rounded-full bg-[#FFC107]/20 flex items-center justify-center text-[#FFC107] mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className={designTokens.typography.metricLabel}>Warnings</p>
              <p className="text-4xl font-bold text-[#FFC107] mt-1">145</p>
            </CardContent>
          </Card>

          <Card className="border-[#F85149]/30 bg-[#F85149]/5">
            <CardContent className="flex flex-col items-center text-center py-8">
              <div className="w-12 h-12 rounded-full bg-[#F85149]/20 flex items-center justify-center text-[#F85149] mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className={designTokens.typography.metricLabel}>Rejected Items</p>
              <p className="text-4xl font-bold text-[#F85149] mt-1">28</p>
            </CardContent>
          </Card>
        </StatGrid>
      </section>

      {/* Catalog Sync Grid */}
      <section className="space-y-4">
        <SectionHeader title="Catalog Sync Grid" subtitle="Real-time status of your product catalogs on external platforms." />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {platforms.map((platform) => (
            <Card key={platform.name} className="flex flex-col h-full bg-[#161B22] border-[#30363D] hover:border-slate-500 transition-all">
              <CardContent className="flex-grow">
                <div className="flex justify-between items-start mb-6">
                  <div className="text-2xl bg-slate-800 p-2 rounded-lg">{platform.icon}</div>
                  <Badge variant={platform.variant}>{platform.status}</Badge>
                </div>
                <div className="space-y-1 mb-8">
                  <h4 className="font-bold text-white text-base leading-tight">{platform.name}</h4>
                  <p className="text-2xl font-black text-cyan-400">{platform.count}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Products Synchronized</p>
                </div>
              </CardContent>
              <div className="p-4 pt-0">
                <Button variant="secondary" className="w-full text-xs py-2.5 font-bold uppercase tracking-wider">
                  Sync Now
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Common Errors List */}
      <section className="space-y-4">
        <SectionHeader title="Common Feed Errors" subtitle="Address these issues to improve your visibility and conversion rates." />
        <Card className="bg-[#161B22] border-[#30363D]">
          <div className="divide-y divide-[#30363D]">
            {commonErrors.map((error) => (
              <div key={error.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#21262D] transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${error.impact === 'Critical' || error.impact === 'High' ? 'bg-[#F85149] shadow-[0_0_8px_rgba(248,81,73,0.5)]' : 'bg-[#FFC107]'}`} />
                  <div>
                    <p className="text-sm font-semibold text-white">{error.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">{error.count} products affected</span>
                      <span className="text-xs text-slate-600">•</span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider ${error.impact === 'Critical' ? 'text-[#F85149]' : 'text-slate-500'}`}>Impact: {error.impact}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-[10px] uppercase font-bold tracking-widest h-9 px-4 hover:bg-slate-800">Bulk Fix</Button>
                  <Button variant="primary" className="text-[10px] uppercase font-bold tracking-widest h-9 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 border-0 shadow-lg shadow-indigo-500/20">AI Fix</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
