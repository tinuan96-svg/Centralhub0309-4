import { supabase } from '@/lib/supabase';
import { Order, OrderWithItems } from '@/lib/types';
import { ProfitAnalysisService } from '../profitAnalysisService';
import { inventoryForecastService } from '../inventory/inventoryForecastService';
import { customerChurnService } from './customerChurnService';
import { nextBestActionService } from './nextBestActionService';

export type LifecycleStage = 'new' | 'first_purchase' | 'active' | 'repeat' | 'loyal' | 'vip' | 'at_risk' | 'inactive' | 'churned';

export interface CustomerIntelligence {
  customer_key: string;
  recency_days: number;
  frequency: number;
  monetary_value: number;
  rfm_score: number;
  lifecycle_stage: LifecycleStage;
  last_order_at: string;
}

export interface AttributionResult {
  order_id: string;
  attribution_model: 'first_touch' | 'last_touch';
  attributed_revenue: number;
  attributed_profit: number;
  source?: string;
  medium?: string;
  campaign?: string;
}

export const intelligenceService = {
  /**
   * Fetch all intelligence module feature flags
   */
  async getFeatureFlags() {
    const { data, error } = await supabase.from('system_intelligence_settings').select('key, value');
    if (error) return {};
    return data.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, boolean>);
  },

  /**
   * Calculate RFM and Lifecycle Stage for a set of orders from one customer
   */
  async calculateLifecycle(customerOrders: Order[]): Promise<LifecycleStage> {
    if (customerOrders.length === 0) return 'new';
    if (customerOrders.length === 1) return 'first_purchase';

    const { data: configs } = await supabase
      .from('customer_lifecycle_config')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (!configs || configs.length === 0) return 'active';

    const lastOrder = new Date(Math.max(...customerOrders.map(o => new Date(o.created_at).getTime())));
    const now = new Date();
    const recencyDays = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));
    const frequency = customerOrders.length;
    const monetaryValue = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    for (const config of configs) {
      const matchRecency = (config.min_recency_days === null || recencyDays >= config.min_recency_days) &&
                           (config.max_recency_days === null || recencyDays <= config.max_recency_days);
      const matchFrequency = (config.min_frequency === null || frequency >= config.min_frequency);
      const matchMonetary = (config.min_monetary_value === null || monetaryValue >= config.min_monetary_value);

      if (matchRecency && matchFrequency && matchMonetary) {
        return config.stage as LifecycleStage;
      }
    }

    return 'active';
  },

  /**
   * Calculate attribution for an order using Last-Touch and First-Touch models (Phase 10)
   */
  async calculateAttribution(orderId: string): Promise<void> {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (!order) return;

    const productRevenue = (order.total || 0) - (order.delivery_fee || 0);
    const productCost = order.product_cost_net || 0;
    const gatewayFee = order.gateway_fee_net || 0;
    const attributedProfit = productRevenue - productCost - gatewayFee;

    if (order.utm_source || order.utm_medium || order.utm_campaign) {
      // Last Touch (Current order UTMs)
      await supabase.from('marketing_attribution_results').upsert({
        order_id: order.id,
        customer_key: order.customer_email || order.customer_phone,
        attribution_model: 'last_touch',
        attributed_revenue: order.total || 0,
        attributed_profit: attributedProfit,
        utm_source: order.utm_source,
        utm_medium: order.utm_medium,
        utm_campaign: order.utm_campaign,
        touchpoint_at: order.created_at
      }, { onConflict: 'order_id, attribution_model' });

      // First Touch (Oldest order with UTMs for this customer)
      const { data: firstOrder } = await supabase
        .from('orders')
        .select('utm_source, utm_medium, utm_campaign, created_at')
        .or(`customer_email.eq.${order.customer_email},customer_phone.eq.${order.customer_phone}`)
        .not('utm_source', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (firstOrder) {
        await supabase.from('marketing_attribution_results').upsert({
          order_id: order.id,
          customer_key: order.customer_email || order.customer_phone,
          attribution_model: 'first_touch',
          attributed_revenue: order.total || 0,
          attributed_profit: attributedProfit,
          utm_source: firstOrder.utm_source,
          utm_medium: firstOrder.utm_medium,
          utm_campaign: firstOrder.utm_campaign,
          touchpoint_at: firstOrder.created_at
        }, { onConflict: 'order_id, attribution_model' });
      }
    }
  },

  /**
   * Evaluate stock health and generate reorder recommendations
   */
  async generateReorderRecommendations(productId: string, storeId?: string | null) {
    const forecast = await inventoryForecastService.calculateForecast(productId, storeId);
    if (!forecast || (forecast.risk_level !== 'risk' && forecast.risk_level !== 'critical')) return null;

    const { data: product } = await supabase
      .from('products')
      .select('id, name, price, cost_price, sku, product_suppliers(supplier_id, suppliers(name, avg_lead_time_days))')
      .eq('id', productId)
      .single();

    if (!product) return null;

    const supplier: any = Array.isArray(product.product_suppliers) ? product.product_suppliers[0]?.suppliers : null;
    const supplier_id = Array.isArray(product.product_suppliers) ? product.product_suppliers[0]?.supplier_id : null;

    const leadTime = supplier?.avg_lead_time_days || 7;
    const recommendedQty = Math.ceil((leadTime + 14) * forecast.avg_daily_sales);

    if (recommendedQty <= 0) return null;

    const rec = {
      recommendation_type: 'inventory_reorder',
      entity_type: 'product',
      entity_id: productId,
      title: `Restock Recommendation: ${product.name}`,
      description: `Stock is ${forecast.risk_level.toUpperCase()} with ${forecast.days_of_cover} days of cover remaining.`,
      proposed_action: `Create PO Draft for ${recommendedQty} units.`,
      reason: `Projected stockout based on last 30 days velocity (${forecast.avg_daily_sales.toFixed(2)}/day).`,
      confidence: forecast.confidence === 'high' ? 0.9 : 0.7,
      status: 'recommended',
      store_id: storeId || null,
      source_snapshot: {
        price: product.price,
        cost: product.cost_price,
        stock: forecast.stock_quantity
      },
      metadata: {
        suggested_quantity: recommendedQty,
        supplier_id: supplier_id,
        supplier_name: supplier?.name,
        estimated_cost: recommendedQty * (product.cost_price || 0),
        items: [{
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          quantity: recommendedQty,
          cost_price: product.cost_price || 0,
          supplier_id: supplier_id
        }]
      }
    };

    const { data, error } = await supabase
      .from('intelligence_recommendations')
      .upsert(rec as any, {
        onConflict: storeId ? 'recommendation_type, entity_id, store_id' : 'recommendation_type, entity_id'
      })
      .select()
      .single();

    if (error) console.error('[Intelligence] Error upserting reorder rec:', error.message);

    return data;
  },

  /**
   * Get Inventory health for a campaign's products
   */
  async getCampaignInventoryHealth(productIds: string[]): Promise<Record<string, 'HEALTHY' | 'RISK' | 'CRITICAL'>> {
    const { data: inventory } = await supabase
      .from('central_inventory')
      .select('product_id, stock_quantity, low_stock_threshold')
      .in('product_id', productIds);

    const healthMap: Record<string, 'HEALTHY' | 'RISK' | 'CRITICAL'> = {};

    inventory?.forEach(item => {
      if (item.stock_quantity <= 0) {
        healthMap[item.product_id] = 'CRITICAL';
      } else if (item.stock_quantity <= (item.low_stock_threshold || 5)) {
        healthMap[item.product_id] = 'RISK';
      } else {
        healthMap[item.product_id] = 'HEALTHY';
      }
    });

    return healthMap;
  },

  /**
   * Run a full intelligence sync for customers (Hardened for Store Scope)
   */
  async syncAllCustomerIntelligence(storeId?: string | null) {
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: orders } = await query;
    if (!orders) return;

    const customerMap = new Map<string, any[]>();
    orders.forEach(o => {
      const key = o.customer_email || o.customer_phone || o.id;
      if (!customerMap.has(key)) customerMap.set(key, []);
      customerMap.get(key)!.push(o);
    });

    const now = new Date();

    for (const [key, custOrders] of customerMap.entries()) {
      const stage = await this.calculateLifecycle(custOrders);
      const ltv = custOrders.reduce((s, o) => s + (o.total || 0), 0);
      const profit = custOrders.reduce((s, o) => s + (o.gross_profit || 0), 0);

      const lastOrder = new Date(custOrders[0].created_at);
      const recencyDays = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));

      // RFM Score calculation
      const rScore = recencyDays < 30 ? 5 : recencyDays < 60 ? 4 : recencyDays < 90 ? 3 : recencyDays < 180 ? 2 : 1;
      const fScore = custOrders.length >= 10 ? 5 : custOrders.length >= 5 ? 4 : custOrders.length >= 3 ? 3 : custOrders.length >= 2 ? 2 : 1;
      const mScore = ltv > 1000 ? 5 : ltv > 500 ? 4 : ltv > 200 ? 3 : ltv > 100 ? 2 : 1;
      const rfmScore = Math.round((rScore + fScore + mScore) / 3);

      const churnRisk = customerChurnService.calculateChurnRisk(custOrders);
      const nba = await nextBestActionService.determineNBA(custOrders);

      const intelData = {
        customer_key: key,
        customer_email: custOrders[0].customer_email,
        customer_phone: custOrders[0].customer_phone,
        recency_days: recencyDays,
        frequency: custOrders.length,
        monetary_value: ltv,
        rfm_score: rfmScore,
        lifecycle_stage: stage,
        lifetime_value: ltv,
        lifetime_profit: profit,
        order_count: custOrders.length,
        last_order_at: custOrders[0].created_at,
        last_calculated_at: new Date().toISOString(),
        store_id: storeId || null,
        calculation_scope: storeId ? 'store' : 'global',
        churn_probability: churnRisk?.probability || 0,
        risk_level: churnRisk?.risk_level.toLowerCase() || 'low',
        avg_reorder_interval_days: churnRisk?.avg_interval_days || 0
      };

      // HARDENING: Proper onConflict logic based on scope
      await supabase.from('customer_intelligence').upsert(intelData, {
        onConflict: storeId ? 'customer_key, store_id' : 'customer_key'
      });

      if (nba.action !== 'NO_ACTION' && nba.confidence > 0.8) {
        await supabase.from('intelligence_recommendations').upsert({
          recommendation_type: 'customer_recovery',
          entity_type: 'customer',
          entity_id: key,
          store_id: storeId || null,
          title: `NBA: ${nba.action.replace(/_/g, ' ')}`,
          description: nba.reason,
          reason: `Confidence: ${Math.round(nba.confidence * 100)}%`,
          proposed_action: nba.action,
          expected_impact: `Potential Value: ${nba.expected_value}`,
          confidence: nba.confidence,
          status: 'recommended',
          metadata: { nba }
        }, { onConflict: storeId ? 'recommendation_type, entity_id, store_id' : 'recommendation_type, entity_id' });
      }
    }
  }
};
