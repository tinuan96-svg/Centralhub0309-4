'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@/lib/design-system';
import { simulationService, SimulationResult } from '@/lib/services/marketing/simulationService';
import { formatCurrency } from '@/lib/utils/currency';
import { supabase } from '@/lib/supabase';
import { CompetitorVerificationService } from '@/lib/services/competitors/competitorVerificationService';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function PromotionSimulator({ storeId: initialStoreId }: { storeId?: string | null }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(initialStoreId || null);
  const [params, setParams] = useState({
    product_id: '',
    store_id: null as string | null,
    discount_percent: 10,
    current_price: 0,
    cost_price: 0,
    duration_days: 30,
    inventory_quantity: 0,
    sales_velocity: 0,
    min_margin: 8,
    competitor_median: null as number | null
  });

  const [products, setProducts] = useState<any[]>([]);
  const [isProposing, setIsProposing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [competitorData, setCompetitorData] = useState<any>(null);

  const result = useMemo(() => {
    if (!params.product_id || params.current_price === 0) return null;
    return simulationService.calculate(params);
  }, [params]);

  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [fetchingAi, setFetchingAi] = useState(false);

  useEffect(() => {
    if (result && params.product_id) {
        const prod = products.find(p => p.id === params.product_id);
        if (prod) {
            setFetchingAi(true);
            simulationService.getAiExplanation(params, result, prod.name)
              .then(setAiExplanation)
              .finally(() => setFetchingAi(false));
        }
    }
  }, [result, params.product_id, products]);

  const handlePropose = async () => {
    if (!params.product_id || isProposing || !result) return;
    if (result.classification === 'DO NOT PROMOTE') {
        alert(`Cannot propose: ${result.reason}`);
        return;
    }

    setIsProposing(true);
    try {
      const product = products.find(p => p.id === params.product_id);

      // Save to simulation history
      await simulationService.saveSimulation({
          ...params,
          store_id: selectedStoreId
      });

      // Create official recommendation
      await supabase.from('intelligence_recommendations').upsert({
        recommendation_type: 'promotion',
        entity_type: 'product',
        entity_id: params.product_id,
        store_id: selectedStoreId,
        title: `Promotion: ${product?.name} (${params.discount_percent}% OFF)`,
        description: `${result.reason} Recommended price: ${formatCurrency(result.promotional_price)}.`,
        proposed_action: `Run ${params.duration_days}-day promotion at ${formatCurrency(result.promotional_price)}`,
        expected_impact: `Revenue: ${formatCurrency(result.expected_revenue)} | Proj. Margin: ${result.expected_margin.toFixed(1)}%`,
        confidence: 0.9,
        risk_level: result.classification === 'HIGH RISK' ? 3 : result.classification === 'CAUTION' ? 2 : 1,
        status: 'recommended',
        metadata: {
          simulation_params: params,
          simulation_result: result,
          is_promotion: true
        },
        source_snapshot: {
          price: params.current_price,
          cost: params.cost_price,
          inventory: params.inventory_quantity,
          velocity: params.sales_velocity,
          competitor_median: params.competitor_median
        }
      }, { onConflict: 'recommendation_type, entity_id' });

      alert('Promotion proposal submitted to Approval Centre.');
    } catch (err) {
      console.error('Failed to propose promotion:', err);
    } finally {
      setIsProposing(false);
    }
  };

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      let query = supabase.from('products').select(`
        id, name, price, cost_price, min_margin,
        central_inventory(stock_quantity),
        inventory_forecasts(sales_velocity_30d)
      `).eq('is_deleted', false).eq('is_active', true);

      const { data } = await query.limit(100);
      setProducts(data || []);

      if (data && data.length > 0) {
        handleProductChange(data[0].id, data);
      }
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleProductChange = async (id: string, productList?: any[]) => {
    const list = productList || products;
    const prod = list.find(p => p.id === id);
    if (prod) {
      // Get ALL competitor prices for this product
      const { data: allPrices } = await supabase.from('competitor_prices')
        .select('*')
        .eq('product_id', id);

      // Use Canonical Verification Service to filter and analyze
      const marketData = CompetitorVerificationService.getVerifiedMarketData(allPrices || []);

      let median: number | null = null;
      if (marketData) {
          median = marketData.median;
          setCompetitorData({
              lowest: marketData.lowest,
              highest: marketData.highest,
              median: marketData.median,
              count: marketData.verified_count
          });
      } else {
          setCompetitorData(null);
      }

      setParams(prev => ({
        ...prev,
        product_id: id,
        current_price: Number(prod.price),
        cost_price: Number(prod.cost_price || 0),
        min_margin: Number(prod.min_margin || 8),
        inventory_quantity: prod.central_inventory?.[0]?.stock_quantity || 0,
        sales_velocity: prod.inventory_forecasts?.[0]?.sales_velocity_30d || 0,
        competitor_median: median
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Store Selector */}
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <Card className="p-6 bg-slate-900/50 border-slate-800 space-y-6">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Simulation Parameters</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Target Product</label>
              <select
                value={params.product_id}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                disabled={loadingProducts}
              >
                {products.length === 0 && <option value="">No products in scope</option>}
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Discount Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="99"
                value={params.discount_percent}
                onChange={(e) => setParams(prev => ({ ...prev, discount_percent: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white font-bold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Duration (Days)</label>
                <input
                  type="number"
                  value={params.duration_days}
                  onChange={(e) => setParams(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Min Margin (%)</label>
                <input
                  type="number"
                  value={params.min_margin}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-slate-500 text-sm cursor-not-allowed"
                  disabled
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500 font-bold uppercase">Current Price</span>
                    <span className="text-slate-300 font-bold">{formatCurrency(params.current_price)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500 font-bold uppercase">Product Cost</span>
                    <span className="text-slate-300 font-bold">{formatCurrency(params.cost_price)}</span>
                </div>
                {params.cost_price === 0 && (
                    <p className="text-[9px] text-rose-500 font-black uppercase">⚠️ MISSING COST DATA</p>
                )}
            </div>
          </div>
        </Card>

        {/* Results */}
        <Card className="p-6 lg:col-span-2 bg-slate-900/50 border-slate-800">
          {!result ? (
            <div className="h-full flex items-center justify-center text-slate-600 font-bold uppercase tracking-widest text-sm">
                Select a product to start simulation
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Simulation Analysis</h3>
                 <Badge variant={
                    result.classification === 'SAFE' ? 'success' :
                    result.classification === 'COMPETITIVE OPPORTUNITY' ? 'success' :
                    result.classification === 'CAUTION' ? 'warning' : 'danger'
                 }>
                    {result.classification}
                 </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Promotional Price</p>
                    <p className="text-4xl font-black text-white">{formatCurrency(result.promotional_price)}</p>
                    <div className="flex gap-4 mt-2">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Margin: <span className={result.promotional_margin_percent < params.min_margin ? 'text-rose-500' : 'text-emerald-400'}>
                                {result.promotional_margin_percent.toFixed(1)}%
                            </span>
                        </p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Profit/Unit: <span className="text-slate-200">{formatCurrency(result.promotional_unit_profit)}</span>
                        </p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border ${result.classification === 'DO NOT PROMOTE' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Break-even Volume Uplift</p>
                    <p className="text-2xl font-black text-white">+{result.required_volume_uplift_percent.toFixed(1)}%</p>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        {result.reason}
                    </p>

                    {aiExplanation && (
                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <p className="text-[9px] text-blue-400 font-black uppercase mb-1 flex items-center gap-1">
                                <span>✨</span> AI Strategic Insight
                            </p>
                            <p className="text-[11px] text-slate-300 italic leading-snug">
                                &quot;{aiExplanation}&quot;
                            </p>
                        </div>
                    )}
                    {fetchingAi && !aiExplanation && (
                        <div className="mt-4 pt-4 border-t border-slate-700/50 animate-pulse">
                            <div className="h-2 w-20 bg-slate-700 rounded mb-2"></div>
                            <div className="h-3 w-full bg-slate-800 rounded"></div>
                        </div>
                    )}
                  </div>

                  {competitorData && (
                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                        <p className="text-[10px] text-indigo-400 font-black uppercase mb-2">Market Context</p>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Competitor Median:</span>
                                <span className="text-slate-200 font-bold">{formatCurrency(competitorData.median)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Market Position:</span>
                                <span className="text-emerald-400 font-bold">
                                    {result.promotional_price < competitorData.lowest ? 'CHEEPEST IN MARKET' :
                                     result.promotional_price <= competitorData.median ? 'AT/BELOW MEDIAN' : 'PREMIUM POSITION'}
                                </span>
                            </div>
                        </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Current Velocity</p>
                        <p className="text-lg font-bold text-slate-200">{params.sales_velocity.toFixed(1)} <span className="text-[10px] text-slate-500">/day</span></p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Req. Velocity</p>
                        <p className="text-lg font-bold text-cyan-400">{(params.sales_velocity * result.required_volume_multiplier).toFixed(1)} <span className="text-[10px] text-slate-500">/day</span></p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Current Stock</p>
                        <p className="text-lg font-bold text-slate-200">{params.inventory_quantity}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Stock Depletion</p>
                        <p className={`text-lg font-bold ${result.projected_days_of_cover < params.duration_days ? 'text-rose-500' : 'text-slate-200'}`}>
                            {result.projected_days_of_cover.toFixed(1)} <span className="text-[10px] text-slate-500">days</span>
                        </p>
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 text-xs font-black tracking-widest uppercase shadow-2xl active:scale-95 transition-all"
                    onClick={handlePropose}
                    disabled={!params.product_id || isProposing || result.classification === 'DO NOT PROMOTE'}
                  >
                    {isProposing ? 'PROCESSING...' : 'Send for Approval'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-2xl flex items-start gap-4">
        <span className="text-lg">💡</span>
        <p className="text-[11px] text-slate-500 leading-relaxed italic">
            This simulator uses deterministic financial modelling to calculate the volume uplift required to maintain total gross profit.
            <b> Margin Protection</b> prevents promotions that would fall below your configured safety floor.
            <b> Inventory Intelligence</b> flags promotions that are likely to cause immediate stockouts.
        </p>
      </div>
    </div>
  );
}
