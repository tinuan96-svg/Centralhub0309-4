'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Badge, StatCard } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import { ProductService } from '@/lib/services/productService';

// Simple Icons
const Icons = {
  Sparkles: () => <span className="text-xl">✨</span>,
  TrendingUp: () => <span className="text-xl">📈</span>,
  TrendingDown: () => <span className="text-xl">📉</span>,
  Target: () => <span className="text-xl">🎯</span>,
  Zap: () => <span className="text-xl">⚡</span>,
  Shield: () => <span className="text-xl">🛡️</span>,
  Settings: () => <span className="text-xl">⚙️</span>,
  PenTool: () => <span className="text-xl">✍️</span>,
};

type Tab = 'insights' | 'studio' | 'safety';
type MarketingConnectionRow = {
  id: string;
  store_id: string;
  provider_id: string;
  status: string;
  external_account_name: string | null;
  last_sync_at: string | null;
  health_score: number | null;
  last_error: string | null;
};

type MarketingMetricRow = {
  provider_id: string;
  date: string;
  spend: number | string | null;
  conversion_value: number | string | null;
  conversions: number | null;
  impressions: number | null;
  clicks: number | null;
};

type MarketingInsightRow = {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  status: string;
  created_at: string;
};

type AnalyticsMetricRow = {
  metric_date: string;
  users: number | null;
  sessions: number | null;
  page_views: number | null;
  product_views: number | null;
  add_to_carts: number | null;
  checkouts: number | null;
  purchases: number | null;
  revenue: number | string | null;
  updated_at: string | null;
};

type MarketingSnapshot = {
  loading: boolean;
  error: string | null;
  connections: MarketingConnectionRow[];
  metrics: MarketingMetricRow[];
  insights: MarketingInsightRow[];
  webMetrics: AnalyticsMetricRow[];
  checkedAt: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  google_ads: 'Google Ads',
  meta: 'Meta',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const formatGBP = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(value);

const formatCheckedAt = (value: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'not available';


export default function AIMarketingManagerClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Content Studio State
  const [content, setContent] = useState({
    platform: 'whatsapp',
    language: 'english',
    topic: 'New Product Launch',
    generatedText: ''
  });

  // Safety State
  const [safety, setSafety] = useState({
    maxAutoBudgetChange: 20,
    dailySpendLimit: 500,
    autoApproveLowRisk: false
  });


  const [marketingSnapshot, setMarketingSnapshot] = useState<MarketingSnapshot>({
    loading: true,
    error: null,
    connections: [],
    metrics: [],
    insights: [],
    webMetrics: [],
    checkedAt: null
  });
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        let prods;
        if (selectedStoreId) {
          prods = await ProductService.getProductsForStore(selectedStoreId);
        } else {
          prods = await ProductService.getAllProducts();
        }
        setProducts(prods);
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, [selectedStoreId]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketingSnapshot = async () => {
      const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setMarketingSnapshot((previous) => ({ ...previous, loading: true, error: null }));

      try {
        const scope = (query: any) => selectedStoreId ? query.eq('store_id', selectedStoreId) : query;
        const connectionsQuery = scope(
          supabase
            .from('marketing_connections')
            .select('id,store_id,provider_id,status,external_account_name,last_sync_at,health_score,last_error')
        ).order('updated_at', { ascending: false });
        const metricsQuery = scope(
          supabase
            .from('marketing_metrics')
            .select('provider_id,date,spend,conversion_value,conversions,impressions,clicks')
            .gte('date', since)
        ).order('date', { ascending: false });
        const insightsQuery = scope(
          supabase
            .from('marketing_insights')
            .select('id,title,description,priority,status,created_at')
            .eq('status', 'new')
        ).order('created_at', { ascending: false });
        const webMetricsQuery = scope(
          supabase
            .from('analytics_daily_metrics')
            .select('metric_date,users,sessions,page_views,product_views,add_to_carts,checkouts,purchases,revenue,updated_at')
            .gte('metric_date', since)
        ).order('metric_date', { ascending: false });

        const [connectionsResult, metricsResult, insightsResult, webMetricsResult] = await Promise.all([
          connectionsQuery,
          metricsQuery,
          insightsQuery,
          webMetricsQuery
        ]);

        const firstError =
          connectionsResult.error ||
          metricsResult.error ||
          insightsResult.error ||
          webMetricsResult.error;

        if (firstError) throw firstError;
        if (cancelled) return;

        setMarketingSnapshot({
          loading: false,
          error: null,
          connections: (connectionsResult.data || []) as MarketingConnectionRow[],
          metrics: (metricsResult.data || []) as MarketingMetricRow[],
          insights: (insightsResult.data || []) as MarketingInsightRow[],
          webMetrics: (webMetricsResult.data || []) as AnalyticsMetricRow[],
          checkedAt: new Date().toISOString()
        });
      } catch (error: any) {
        if (cancelled) return;
        setMarketingSnapshot((previous) => ({
          ...previous,
          loading: false,
          error: error?.message || 'Unable to read marketing data.',
          checkedAt: new Date().toISOString()
        }));
      }
    };

    loadMarketingSnapshot();
    return () => { cancelled = true; };
  }, [selectedStoreId]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('marketing-intelligence-ai', {
        body: {
          action: 'generate_content',
          platform: content.platform,
          language: content.language,
          topic: content.topic,
          store_id: selectedStoreId,
          product_id: selectedProductId
        }
      });

      if (response.error) throw response.error;

      setContent(prev => ({
        ...prev,
        generatedText: response.data?.text || 'Failed to generate content.'
      }));
    } catch (err) {
      console.error('AI Generation failed:', err);
      alert('AI Generation failed. Please check your OpenAI API Key and connection.');
      setContent(prev => ({ ...prev, generatedText: '' }));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveContent = async () => {
    if (!content.generatedText) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('intelligence_recommendations').insert({
        recommendation_type: 'content_generation',
        entity_type: 'campaign',
        title: `AI Content: ${content.topic}`,
        description: content.generatedText,
        proposed_action: 'Publish to ' + content.platform,
        status: 'recommended',
        store_id: selectedStoreId,
        risk_level: 2,
        metadata: {
          platform: content.platform,
          language: content.language,
          topic: content.topic
        }
      });

      if (error) throw error;
      alert('Content saved as DRAFT. Please review and approve in Marketing Intelligence.');
      setContent(prev => ({ ...prev, generatedText: '' }));
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Failed to save approval.');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewInsight = async (insight: MarketingInsightRow) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('marketing_insights')
        .update({ status: 'viewed' })
        .eq('id', insight.id);

      if (error) throw error;

      setMarketingSnapshot((previous) => ({
        ...previous,
        insights: previous.insights.filter((item) => item.id !== insight.id)
      }));
      alert('Insight marked as reviewed. No external budget or campaign change was made.');
    } catch (error) {
      console.error('Insight review failed:', error);
      alert('Could not mark this insight as reviewed.');
    } finally {
      setLoading(false);
    }
  };

  const paidTotals = marketingSnapshot.metrics.reduce(
    (totals, row) => ({
      spend: totals.spend + Number(row.spend || 0),
      revenue: totals.revenue + Number(row.conversion_value || 0),
      conversions: totals.conversions + Number(row.conversions || 0),
      impressions: totals.impressions + Number(row.impressions || 0),
      clicks: totals.clicks + Number(row.clicks || 0)
    }),
    { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }
  );

  const providerTotalsMap: Record<string, { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }> = {};
  marketingSnapshot.metrics.forEach((row) => {
    const provider = row.provider_id || 'unknown';
    const totals = providerTotalsMap[provider] || { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    totals.spend += Number(row.spend || 0);
    totals.revenue += Number(row.conversion_value || 0);
    totals.conversions += Number(row.conversions || 0);
    totals.impressions += Number(row.impressions || 0);
    totals.clicks += Number(row.clicks || 0);
    providerTotalsMap[provider] = totals;
  });
  const providerTotals = Object.entries(providerTotalsMap).sort(([, a], [, b]) => b.spend - a.spend);

  const webTotals = marketingSnapshot.webMetrics.reduce(
    (totals, row) => ({
      users: totals.users + Number(row.users || 0),
      sessions: totals.sessions + Number(row.sessions || 0),
      pageViews: totals.pageViews + Number(row.page_views || 0),
      productViews: totals.productViews + Number(row.product_views || 0),
      addToCarts: totals.addToCarts + Number(row.add_to_carts || 0),
      checkouts: totals.checkouts + Number(row.checkouts || 0),
      purchases: totals.purchases + Number(row.purchases || 0),
      revenue: totals.revenue + Number(row.revenue || 0)
    }),
    { users: 0, sessions: 0, pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, purchases: 0, revenue: 0 }
  );

  const hasPaidData = marketingSnapshot.metrics.length > 0;
  const hasWebData = marketingSnapshot.webMetrics.length > 0;
  const paidRoas = paidTotals.spend > 0 ? (paidTotals.revenue / paidTotals.spend).toFixed(2) + 'x' : 'Not available';
  const summaryText = marketingSnapshot.loading
    ? 'Checking store-scoped connections, synced campaign metrics and verified website analytics.'
    : marketingSnapshot.error
      ? 'Marketing data could not be read from the database, so no analysis is being presented as fact.'
      : hasPaidData
        ? 'Verified paid-channel data has been loaded from synced provider metrics for the selected store scope.'
        : marketingSnapshot.connections.length === 0
          ? 'No store-owned paid marketing connection is recorded. Paid ROAS, ad trends and budget recommendations are withheld until a real provider sync exists.'
          : 'A store-owned provider connection exists, but no paid campaign metrics have been synced yet.';
  const websiteSummary = hasWebData
    ? 'Verified website activity in the last 30 days: ' + webTotals.users.toLocaleString() + ' users, ' + webTotals.sessions.toLocaleString() + ' sessions and ' + webTotals.purchases.toLocaleString() + ' purchases.'
    : 'No verified website activity rows are available for the last 30 days.';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="AI Marketing Manager"
          subtitle="Autonomous intelligence for your store's growth."
        />
        <div className="w-full md:w-64">
          <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800 w-fit">
        {[
          { id: 'insights', label: 'Performance & Insights', icon: <Icons.TrendingUp /> },
          { id: 'studio', label: 'Content Studio', icon: <Icons.PenTool /> },
          { id: 'safety', label: 'Safety & Limits', icon: <Icons.Shield /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'insights' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-3 p-6 bg-gradient-to-br from-blue-900/20 to-slate-900 border-blue-500/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/50">
                  <Icons.Sparkles />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter">Verified Intelligence Summary</h3>
                    <Badge variant={marketingSnapshot.error ? 'danger' : marketingSnapshot.loading ? 'warning' : 'success'}>
                      {marketingSnapshot.error ? 'DATA ERROR' : marketingSnapshot.loading ? 'CHECKING' : 'LIVE DATABASE'}
                    </Badge>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{summaryText}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{websiteSummary}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                    Last checked: {formatCheckedAt(marketingSnapshot.checkedAt)}
                  </p>
                </div>
              </div>
            </Card>

            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Verified Recommendations</h4>
              {marketingSnapshot.loading && (
                <Card className="p-5 bg-slate-900/50 border-slate-800">
                  <p className="text-sm text-slate-400">Loading recommendations from the database…</p>
                </Card>
              )}
              {marketingSnapshot.error && (
                <Card className="p-5 bg-red-950/20 border-red-500/30">
                  <p className="text-sm text-red-200">Recommendations are hidden because the database read failed.</p>
                </Card>
              )}
              {!marketingSnapshot.loading && !marketingSnapshot.error && marketingSnapshot.insights.length === 0 && (
                <Card className="p-5 bg-slate-900/50 border-slate-800">
                  <p className="text-sm font-bold text-white">No verified recommendations available.</p>
                  <p className="text-xs text-slate-500 mt-2">Recommendations will appear only after a store-owned provider sync creates a real insight.</p>
                </Card>
              )}
              {!marketingSnapshot.loading && !marketingSnapshot.error && marketingSnapshot.insights.map((insight) => (
                <Card key={insight.id} className="p-5 bg-slate-900/50 border-slate-800">
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                        <Icons.Sparkles />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="font-bold text-white">{insight.title}</h5>
                          <Badge variant={insight.priority === 'high' || insight.priority === 'critical' ? 'danger' : 'warning'}>
                            {(insight.priority || 'medium').toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => handleReviewInsight(insight)}
                      disabled={loading}
                      className="h-9 px-6 text-[10px] font-black uppercase tracking-widest"
                    >
                      Mark Reviewed
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Verified Performance</h4>
              <StatCard title="Paid ROAS" value={paidRoas} />
              <StatCard title="Paid spend (GBP)" value={hasPaidData ? formatGBP(paidTotals.spend) : 'Not available'} />
              <StatCard title="Website sessions (30d)" value={hasWebData ? webTotals.sessions.toLocaleString() : 'Not available'} />
              <StatCard title="Website revenue (30d)" value={hasWebData ? formatGBP(webTotals.revenue) : 'Not available'} />
              {providerTotals.length > 0 && (
                <Card className="p-4 bg-slate-900/50 border-slate-800">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">Synced paid channels</p>
                  <div className="space-y-2">
                    {providerTotals.slice(0, 4).map(([provider, totals]) => (
                      <div key={provider} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-300">{PROVIDER_LABELS[provider] || provider}</span>
                        <span className="text-white font-bold">{totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) + 'x ROAS' : 'No spend'}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controls */}
            <Card className="p-6 bg-slate-900/50 border-slate-800 space-y-6">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Target Product (Optional)</label>
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(e.target.value || null)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none"
                >
                  <option value="">Store-wide copy</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Platform</label>
                <select
                  value={content.platform}
                  onChange={(e) => setContent(prev => ({ ...prev, platform: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Language</label>
                <div className="flex gap-2">
                   {['english', 'malayalam', 'bilingual'].map(l => (
                     <Button
                       key={l}
                       variant={content.language === l ? 'primary' : 'secondary'}
                       className="flex-1 text-[9px] uppercase"
                       onClick={() => setContent(prev => ({ ...prev, language: l }))}
                     >
                       {l}
                     </Button>
                   ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Primary Topic</label>
                <textarea
                  rows={3}
                  value={content.topic}
                  onChange={(e) => setContent(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="e.g. Clearance sale for spices, Weekend special..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none resize-none"
                />
              </div>

              <Button
                onClick={handleGenerate}
                className="w-full h-12 font-black uppercase tracking-widest"
                disabled={loading}
              >
                {loading ? 'AI IS WRITING...' : 'GENERATE COPY'}
              </Button>
            </Card>

            {/* Output */}
            <Card className="p-6 lg:col-span-2 bg-slate-900/50 border-slate-800 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Generated Output</h3>
                 {content.generatedText && <Badge variant="success">READY</Badge>}
              </div>

              <div className="flex-1 min-h-[400px] bg-slate-950/50 border border-slate-800 rounded-2xl p-6 relative">
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">AI is writing...</p>
                  </div>
                ) : content.generatedText ? (
                  <textarea
                    value={content.generatedText}
                    onChange={(e) => setContent(prev => ({ ...prev, generatedText: e.target.value }))}
                    className="w-full h-full bg-transparent text-slate-100 leading-relaxed focus:outline-none resize-none"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 italic text-sm">
                    Generated text will appear here.
                  </div>
                )}
              </div>

              {content.generatedText && (
                <div className="mt-6 flex gap-4">
                   <Button className="flex-1 h-11 text-xs uppercase font-black" onClick={handleApproveContent} disabled={loading}>
                     {loading ? 'SAVING...' : 'Approve & Save'}
                   </Button>
                   <Button variant="secondary" className="h-11 px-6 text-xs uppercase font-black" onClick={() => setContent(prev => ({ ...prev, generatedText: '' }))}>Discard</Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 bg-slate-900/50 border-slate-800 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Icons.Shield />
                <h3 className="font-black text-white uppercase tracking-widest">Autonomous Guardrails</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Set the limits for how much the AI can adjust your marketing parameters without explicit confirmation.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="flex justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Max Auto Budget Change</span>
                    <span className="text-[10px] text-blue-400 font-black">{safety.maxAutoBudgetChange}%</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={safety.maxAutoBudgetChange}
                    onChange={(e) => setSafety(prev => ({ ...prev, maxAutoBudgetChange: parseInt(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-2">Daily Max Spend Limit (AED)</label>
                  <input
                    type="number"
                    value={safety.dailySpendLimit}
                    onChange={(e) => setSafety(prev => ({ ...prev, dailySpendLimit: parseInt(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">Auto-Approve Low Risk</p>
                    <p className="text-[10px] text-slate-500">Enable for changes with &lt; 2% budget impact.</p>
                  </div>
                  <button
                    onClick={() => setSafety(prev => ({ ...prev, autoApproveLowRisk: !prev.autoApproveLowRisk }))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${safety.autoApproveLowRisk ? 'bg-blue-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${safety.autoApproveLowRisk ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <Button className="w-full h-12 font-black uppercase tracking-widest mt-4">
                Save Guardrails
              </Button>
            </Card>

            <Card className="p-6 bg-slate-900/50 border-slate-800 flex flex-col justify-center items-center text-center space-y-4">
               <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-2">
                 <Icons.Settings />
               </div>
               <h4 className="font-black text-white uppercase tracking-widest">Safety Compliance</h4>
               <p className="text-xs text-slate-500 max-w-xs">
                 Your AI Marketing Manager is currently operating under <strong>Restricted Mode</strong>. No changes will be live-applied without manual approval.
               </p>
               <Badge variant="success">System Secure</Badge>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
