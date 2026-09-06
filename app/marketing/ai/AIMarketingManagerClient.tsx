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

  // Recommendations Mock Data
  const [recommendations, setRecommendations] = useState([
    {
      id: '1',
      type: 'budget',
      title: 'Increase Meta ROAS',
      description: 'Meta Ads ROAS dropped 34%. Increase budget for "Best Sellers" campaign by 15% to stabilize.',
      impact: 'High',
      action: 'Apply Budget Change',
      status: 'pending'
    },
    {
      id: '2',
      type: 'audience',
      title: 'Optimise Audience',
      description: 'Frequency on "Re-targeting" set is > 4. Exclude recent buyers (last 7 days) to reduce ad fatigue.',
      impact: 'Medium',
      action: 'Update Audience',
      status: 'pending'
    },
    {
      id: '3',
      type: 'product',
      title: 'TikTok Trend Alert',
      description: '"Organic Turmeric" search volume is up 200%. Launch a spark ad with existing UGC content.',
      impact: 'Medium',
      action: 'Create TikTok Ad',
      status: 'pending'
    }
  ]);

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

  const approveRecommendation = (id: string) => {
    setRecommendations(prev =>
      prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)
    );
    alert('Recommendation Approved and Queue for Execution.');
  };

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
            {/* AI Summary Block */}
            <Card className="lg:col-span-3 p-6 bg-gradient-to-br from-blue-900/20 to-slate-900 border-blue-500/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/50">
                  <Icons.Sparkles />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">Daily Intelligence Summary</h3>
                  <p className="text-slate-300 leading-relaxed">
                    Good morning. Based on last 24h data, Meta ROAS has seen a significant drop (-34%) primarily due to high frequency on retargeting sets.
                    However, TikTok organic traffic for <span className="text-blue-400 font-bold">Organic Turmeric</span> is trending (+200%).
                    I have prepared 3 actionable recommendations to stabilize your ROI and capitalize on this trend.
                  </p>
                </div>
              </div>
            </Card>

            {/* Recommendation Cards */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Active Recommendations</h4>
              {recommendations.map(rec => (
                <Card key={rec.id} className={`p-5 bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors ${rec.status === 'approved' ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                        {rec.type === 'budget' && <Icons.Zap />}
                        {rec.type === 'audience' && <Icons.Target />}
                        {rec.type === 'product' && <Icons.Sparkles />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                           <h5 className="font-bold text-white">{rec.title}</h5>
                           <Badge variant={rec.impact === 'High' ? 'danger' : 'warning'}>{rec.impact} Impact</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{rec.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => approveRecommendation(rec.id)}
                      disabled={rec.status === 'approved'}
                      className="h-9 px-6 text-[10px] font-black uppercase tracking-widest"
                    >
                      {rec.status === 'approved' ? 'Applied' : rec.action}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Secondary Insights */}
            <div className="space-y-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Channel Performance</h4>
              <StatCard title="Meta ROAS" value="2.4x" change={-34} trend="down" />
              <StatCard title="Google CPC" value="AED 1.20" change={12} trend="up" />
              <StatCard title="TikTok CTR" value="4.8%" change={15} trend="up" />
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
