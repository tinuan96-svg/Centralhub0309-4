'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@/lib/design-system';
import { simulationService } from '@/lib/services/marketing/simulationService';
import { formatCurrency } from '@/lib/utils/currency';
import { supabase } from '@/lib/supabase';
import { CompetitorVerificationService } from '@/lib/services/competitors/competitorVerificationService';
import StoreScopeSelector from '@/components/StoreScopeSelector';

export default function PromotionSimulator({ storeId: initialStoreId }: { storeId?: string | null }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(initialStoreId || null);
  const [params, setParams] = useState({
    product_id: '',
    store_id: initialStoreId || null as string | null,
    discount_percent: 10,
    current_price: 0,
    cost_price: 0,
    duration_days: 30,
    inventory_quantity: 0,
    sales_velocity: 0,
    min_margin: 8,
    competitor_median: null as number | null,
  });

  const [products, setProducts] = useState<any[]>([]);
  const [isProposing, setIsProposing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [competitorData, setCompetitorData] = useState<any>(null);
  const [aiExplanation, setAiExplanation] = useState('');
  const [fetchingAi, setFetchingAi] = useState(false);

  const result = useMemo(() => {
    if (!params.product_id || params.current_price === 0) return null;
    return simulationService.calculate(params);
  }, [params]);

  useEffect(() => {
    if (!result || !params.product_id) return;
    const prod = products.find(p => p.id === params.product_id);
    if (!prod) return;

    setFetchingAi(true);
    setAiExplanation('');
    simulationService.getAiExplanation(params, result, prod.name)
      .then(setAiExplanation)
      .finally(() => setFetchingAi(false));
  }, [result, params.product_id, products]);

  const handleProductChange = useCallback(async (id: string, productList?: any[]) => {
    const list = productList || products;
    const prod = list.find(p => p.id === id);
    if (!prod) return;

    const { data: allPrices } = await supabase
      .from('competitor_prices')
      .select('*')
      .eq('product_id', id);

    const marketData = CompetitorVerificationService.getVerifiedMarketData(allPrices || []);
    const median = marketData?.median ?? null;

    setCompetitorData(marketData ? {
      lowest: marketData.lowest,
      highest: marketData.highest,
      median: marketData.median,
      count: marketData.verified_count,
    } : null);

    setParams(prev => ({
      ...prev,
      product_id: id,
      store_id: selectedStoreId,
      current_price: Number(prod.effective_price ?? prod.price ?? 0),
      cost_price: Number(prod.cost_price || 0),
      min_margin: Number(prod.min_margin || 8),
      inventory_quantity: Number(prod.central_inventory?.[0]?.stock_quantity || 0),
      // Canonical simulator velocity is units/day, not the 30-day total.
      sales_velocity: Number(prod.avg_daily_sales || 0),
      competitor_median: median,
    }));
  }, [products, selectedStoreId]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data: baseProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, cost_price, min_margin, central_inventory(stock_quantity)')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .order('name')
        .limit(1000);

      if (productsError) throw productsError;

      let scopedProducts = baseProducts || [];
      if (selectedStoreId) {
        const { data: storeProducts, error: storeProductsError } = await supabase
          .from('store_products')
          .select('product_id, price_override')
          .eq('store_id', selectedStoreId)
          .eq('is_active', true)
          .limit(1000);

        if (storeProductsError) throw storeProductsError;
        const scope = new Map((storeProducts || []).map((row: any) => [row.product_id, row]));
        scopedProducts = scopedProducts
          .filter((product: any) => scope.has(product.id))
          .map((product: any) => {
            const override = Number(scope.get(product.id)?.price_override || 0);
            return { ...product, effective_price: override > 0 ? override : Number(product.price || 0) };
          });
      } else {
        scopedProducts = scopedProducts.map((product: any) => ({
          ...product,
          effective_price: Number(product.price || 0),
        }));
      }

      const productIds = scopedProducts.map((product: any) => product.id);
      const forecastMap = new Map<string, number>();

      if (productIds.length > 0) {
        let forecastQuery = supabase
          .from('inventory_forecasts')
          .select('product_id, avg_daily_sales, store_id')
          .in('product_id', productIds);

        forecastQuery = selectedStoreId
          ? forecastQuery.eq('store_id', selectedStoreId)
          : forecastQuery.is('store_id', null);

        const { data: forecasts, error: forecastError } = await forecastQuery;
        if (forecastError) throw forecastError;
        (forecasts || []).forEach((row: any) => forecastMap.set(row.product_id, Number(row.avg_daily_sales || 0)));
      }

      const hydrated = scopedProducts.map((product: any) => ({
        ...product,
        avg_daily_sales: forecastMap.get(product.id) || 0,
      }));

      setProducts(hydrated);
      if (hydrated.length > 0) {
        await handleProductChange(hydrated[0].id, hydrated);
      } else {
        setParams(prev => ({ ...prev, product_id: '', store_id: selectedStoreId }));
        setCompetitorData(null);
      }
    } catch (error) {
      console.error('[PromotionSimulator] Failed to load scoped products:', error);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedStoreId, handleProductChange]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handlePropose = async () => {
    if (!params.product_id || isProposing || !result) return;
    if (result.classification === 'DO NOT PROMOTE') {
      alert(`Cannot propose: ${result.reason}`);
      return;
    }

    setIsProposing(true);
    try {
      const product = products.find(p => p.id === params.product_id);
      const snapshotTime = new Date().toISOString();

      await simulationService.saveSimulation({ ...params, store_id: selectedStoreId });

      const { error } = await supabase.from('intelligence_recommendations').upsert({
        recommendation_type: 'promotion',
        entity_type: 'product',
        entity_id: params.product_id,
        store_id: selectedStoreId,
        title: `Promotion: ${product?.name} (${params.discount_percent}% OFF)`,
        description: `${result.reason} Recommended price: ${formatCurrency(result.promotional_price)}.`,
        proposed_action: `Run ${params.duration_days}-day promotion at ${formatCurrency(result.promotional_price)}`,
        expected_impact: `Revenue: ${formatCurrency(result.expected_revenue)} | Proj. Margin: ${result.expected_margin.toFixed(1)}%`,
        confidence: 0.9,
        risk_level: result.classification === 'HIGH RISK' ? 3 : result.classification === 'CAUTION' || result.classification === 'INVENTORY RISK' ? 2 : 1,
        status: 'recommended',
        is_stale: false,
        metadata: {
          simulation_params: { ...params, store_id: selectedStoreId },
          simulation_result: result,
          is_promotion: true,
          generated_at: snapshotTime,
        },
        source_snapshot: {
          price: params.current_price,
          cost: params.cost_price,
          inventory: params.inventory_quantity,
          avg_daily_sales: params.sales_velocity,
          competitor_median: params.competitor_median,
          store_id: selectedStoreId,
          generated_at: snapshotTime,
        },
      }, { onConflict: 'recommendation_type,entity_id,store_id' });

      if (error) throw error;
      alert('Promotion proposal submitted to Approval Centre.');
    } catch (err) {
      console.error('Failed to propose promotion:', err);
      alert('Promotion proposal could not be saved. Check the data-quality warnings and try again.');
    } finally {
      setIsProposing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  min="1"
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
              {params.cost_price <= 0 && <p className="text-[9px] text-rose-500 font-black uppercase">⚠️ MISSING COST DATA</p>}
              {params.sales_velocity <= 0 && <p className="text-[9px] text-amber-500 font-black uppercase">⚠️ NO RECENT PAID-SALES VELOCITY</p>}
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2 bg-slate-900/50 border-slate-800">
          {!result ? (
            <div className="h-full flex items-center justify-center text-slate-600 font-bold uppercase tracking-widest text-sm">Select a product to start simulation</div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Simulation Analysis</h3>
                <Badge variant={result.classification === 'SAFE' || result.classification === 'COMPETITIVE OPPORTUNITY' ? 'success' : result.classification === 'CAUTION' ? 'warning' : 'danger'}>
                  {result.classification}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Promotional Price</p>
                    <p className="text-4xl font-black text-white">{formatCurrency(result.promotional_price)}</p>
                    <div className="flex gap-4 mt-2">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Margin: <span className={result.promotional_margin_percent < params.min_margin ? 'text-rose-500' : 'text-emerald-400'}>{result.promotional_margin_percent.toFixed(1)}%</span></p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Profit/Unit: <span className="text-slate-200">{formatCurrency(result.promotional_unit_profit)}</span></p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border ${result.classification === 'DO NOT PROMOTE' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Break-even Volume Uplift</p>
                    <p className="text-2xl font-black text-white">+{result.required_volume_uplift_percent.toFixed(1)}%</p>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{result.reason}</p>

                    {aiExplanation && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-[9px] text-blue-400 font-black uppercase mb-1 flex items-center gap-1"><span>✨</span> AI Strategic Insight</p>
                        <p className="text-[11px] text-slate-300 italic leading-snug">&quot;{aiExplanation}&quot;</p>
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
                      <p className="text-[10px] text-indigo-400 font-black uppercase mb-2">Verified Market Context ({competitorData.count})</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs"><span className="text-slate-500">Competitor Median:</span><span className="text-slate-200 font-bold">{formatCurrency(competitorData.median)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">Market Position:</span><span className="text-emerald-400 font-bold">{result.promotional_price < competitorData.lowest ? 'CHEAPEST IN MARKET' : result.promotional_price <= competitorData.median ? 'AT/BELOW MEDIAN' : 'PREMIUM POSITION'}</span></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Current Velocity</p><p className="text-lg font-bold text-slate-200">{params.sales_velocity.toFixed(2)} <span className="text-[10px] text-slate-500">/day</span></p></div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Req. Velocity</p><p className="text-lg font-bold text-cyan-400">{(params.sales_velocity * result.required_volume_multiplier).toFixed(2)} <span className="text-[10px] text-slate-500">/day</span></p></div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Current Stock</p><p className="text-lg font-bold text-slate-200">{params.inventory_quantity}</p></div>
                    <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Stock Depletion</p><p className={`text-lg font-bold ${result.projected_days_of_cover < params.duration_days ? 'text-rose-500' : 'text-slate-200'}`}>{result.projected_days_of_cover.toFixed(1)} <span className="text-[10px] text-slate-500">days</span></p></div>
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
          This simulator uses deterministic financial modelling and daily paid-sales velocity. <b>Margin Protection</b> blocks missing-cost or below-floor proposals. <b>Inventory Intelligence</b> uses canonical CentralHub stock and flags stockout risk. Every proposal still requires manual approval.
        </p>
      </div>
    </div>
  );
}
