import { supabase } from '@/lib/supabase';
import { inventoryForecastService } from '../inventory/inventoryForecastService';
import { CompetitorVerificationService } from '../competitors/competitorVerificationService';
import { productEconomicsService } from './productEconomicsService';

export interface DecisionSnapshot {
  product_id: string;
  store_id: string;

  current_price: number;
  cost_price: number;
  margin_percent: number;
  units_sold_30d: number;

  stock_quantity: number;
  days_of_cover: number;
  stock_risk: string;

  lowest_competitor_price?: number;
  price_gap_percent?: number;

  active_campaign_id?: string;
  attribution_revenue_30d: number;

  freshness_score: number;
  generated_at: string;
}

export const decisionSnapshotService = {
  /** Construct a coordinated, store-scoped business snapshot for one product. */
  async getSnapshot(productId: string, storeId: string): Promise<DecisionSnapshot | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [econ, forecast, competitorResult, campaignResult, salesResult] = await Promise.all([
      productEconomicsService.calculateEconomics(productId, storeId),
      inventoryForecastService.calculateForecast(productId, storeId),
      supabase.from('competitor_prices').select('*').eq('product_id', productId),
      supabase.from('campaign_stores').select('campaign_id').eq('store_id', storeId).limit(1).maybeSingle(),
      supabase
        .from('order_items')
        .select('order_id, total_price, orders!inner(id,total,payment_status,order_status,created_at,store_id)')
        .eq('product_id', productId)
        .eq('orders.store_id', storeId)
        .eq('orders.payment_status', 'paid')
        .not('orders.order_status', 'in', '("cancelled","refunded")')
        .gte('orders.created_at', thirtyDaysAgo.toISOString()),
    ]);

    if (!econ || !forecast) return null;

    const marketData = CompetitorVerificationService.getVerifiedMarketData((competitorResult.data || []) as any[]);
    const compPrice = marketData?.lowest;
    const priceGap = compPrice && compPrice > 0
      ? ((econ.current_price - compPrice) / compPrice) * 100
      : undefined;

    let attributionRevenue30d = 0;
    const salesRows = salesResult.data || [];
    const orderIds = Array.from(new Set(salesRows.map((row: any) => row.order_id).filter(Boolean)));

    if (orderIds.length > 0) {
      const { data: attributionRows } = await supabase
        .from('marketing_attribution_results')
        .select('order_id, attributed_revenue')
        .in('order_id', orderIds);

      const attributionByOrder = new Map<string, number>();
      (attributionRows || []).forEach((row: any) => {
        attributionByOrder.set(row.order_id, Number(row.attributed_revenue || 0));
      });

      for (const item of salesRows as any[]) {
        const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
        const orderTotal = Number(order?.total || 0);
        const itemRevenue = Number(item.total_price || 0);
        const attributedOrderRevenue = attributionByOrder.get(item.order_id) || 0;
        if (orderTotal > 0 && itemRevenue > 0 && attributedOrderRevenue > 0) {
          attributionRevenue30d += attributedOrderRevenue * (itemRevenue / orderTotal);
        }
      }
    }

    return {
      product_id: productId,
      store_id: storeId,
      current_price: econ.current_price,
      cost_price: econ.cost_price,
      margin_percent: econ.margin_percent,
      units_sold_30d: econ.sales_30d,
      stock_quantity: forecast.stock_quantity,
      days_of_cover: forecast.days_of_cover,
      stock_risk: forecast.risk_level,
      lowest_competitor_price: compPrice,
      price_gap_percent: priceGap,
      active_campaign_id: campaignResult.data?.campaign_id,
      attribution_revenue_30d: attributionRevenue30d,
      // This snapshot is calculated on demand from current source data.
      freshness_score: 1,
      generated_at: new Date().toISOString(),
    };
  },
};
