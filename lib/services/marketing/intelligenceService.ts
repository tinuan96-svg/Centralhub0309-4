import { supabase } from '@/lib/supabase';
import { Order } from '@/lib/types';
import { inventoryForecastService } from '../inventory/inventoryForecastService';
import { customerChurnService } from './customerChurnService';
import { nextBestActionService } from './nextBestActionService';

export type LifecycleStage = 'new' | 'first_purchase' | 'active' | 'repeat' | 'loyal' | 'vip' | 'at_risk' | 'inactive' | 'churned';

export const intelligenceService = {
  async getFeatureFlags() {
    const { data, error } = await supabase.from('system_intelligence_settings').select('key, value');
    if (error || !data) return {};
    return data.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, boolean>);
  },

  async calculateLifecycle(customerOrders: Order[]): Promise<LifecycleStage> {
    if (customerOrders.length === 0) return 'new';
    if (customerOrders.length === 1) return 'first_purchase';

    const { data: configs } = await supabase
      .from('customer_lifecycle_config')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (!configs?.length) return 'active';
    const lastOrder = new Date(Math.max(...customerOrders.map(o => new Date(o.created_at).getTime())));
    const recencyDays = Math.floor((Date.now() - lastOrder.getTime()) / 86400000);
    const frequency = customerOrders.length;
    const monetaryValue = customerOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    for (const config of configs) {
      const recencyOk = (config.min_recency_days == null || recencyDays >= config.min_recency_days) &&
        (config.max_recency_days == null || recencyDays <= config.max_recency_days);
      const frequencyOk = config.min_frequency == null || frequency >= config.min_frequency;
      const monetaryOk = config.min_monetary_value == null || monetaryValue >= config.min_monetary_value;
      if (recencyOk && frequencyOk && monetaryOk) return config.stage as LifecycleStage;
    }
    return 'active';
  },

  async calculateAttribution(orderId: string): Promise<void> {
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .not('order_status', 'in', '("cancelled","refunded")')
      .maybeSingle();
    if (!order) return;

    const productRevenue = Number(order.total || 0) - Number(order.delivery_fee || 0);
    const productCost = Number(order.product_cost_net || 0);
    const gatewayFee = Number(order.gateway_fee_net || 0);
    const attributedProfit = productRevenue - productCost - gatewayFee;
    if (!order.utm_source && !order.utm_medium && !order.utm_campaign) return;

    await supabase.from('marketing_attribution_results').upsert({
      order_id: order.id,
      customer_key: order.customer_email || order.customer_phone,
      attribution_model: 'last_touch',
      attributed_revenue: Number(order.total || 0),
      attributed_profit: attributedProfit,
      utm_source: order.utm_source,
      utm_medium: order.utm_medium,
      utm_campaign: order.utm_campaign,
      touchpoint_at: order.created_at,
    }, { onConflict: 'order_id,attribution_model' });

    const identityFilters = [
      order.customer_email ? `customer_email.eq.${order.customer_email}` : null,
      order.customer_phone ? `customer_phone.eq.${order.customer_phone}` : null,
    ].filter(Boolean).join(',');
    if (!identityFilters) return;

    const { data: firstOrder } = await supabase
      .from('orders')
      .select('utm_source,utm_medium,utm_campaign,created_at')
      .or(identityFilters)
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .not('order_status', 'in', '("cancelled","refunded")')
      .not('utm_source', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstOrder) {
      await supabase.from('marketing_attribution_results').upsert({
        order_id: order.id,
        customer_key: order.customer_email || order.customer_phone,
        attribution_model: 'first_touch',
        attributed_revenue: Number(order.total || 0),
        attributed_profit: attributedProfit,
        utm_source: firstOrder.utm_source,
        utm_medium: firstOrder.utm_medium,
        utm_campaign: firstOrder.utm_campaign,
        touchpoint_at: firstOrder.created_at,
      }, { onConflict: 'order_id,attribution_model' });
    }
  },

  async generateReorderRecommendations(productId: string, storeId?: string | null) {
    const forecast = await inventoryForecastService.calculateForecast(productId, storeId);
    if (!forecast || !['risk', 'critical'].includes(forecast.risk_level) || forecast.avg_daily_sales <= 0) return null;

    const { data: product } = await supabase
      .from('products')
      .select('id,name,price,cost_price,sku,product_suppliers(supplier_id,cost_price,lead_time_days,suppliers(name,average_delivery_days))')
      .eq('id', productId)
      .maybeSingle();
    if (!product) return null;

    const relationship: any = Array.isArray(product.product_suppliers) ? product.product_suppliers[0] : null;
    const supplier: any = relationship?.suppliers;
    const supplierId = relationship?.supplier_id || null;
    const leadTime = Number(relationship?.lead_time_days || supplier?.average_delivery_days || 7);
    const unitCost = Number(relationship?.cost_price || product.cost_price || 0);
    const recommendedQty = Math.ceil((leadTime + 14) * forecast.avg_daily_sales);
    if (recommendedQty <= 0) return null;

    const recommendation = {
      recommendation_type: 'inventory_reorder',
      entity_type: 'product',
      entity_id: productId,
      store_id: storeId || null,
      title: `Restock Recommendation: ${product.name}`,
      description: `Stock is ${forecast.risk_level.toUpperCase()} with ${forecast.days_of_cover.toFixed(1)} days of cover remaining.`,
      proposed_action: supplierId ? `Create PO Draft for ${recommendedQty} units.` : `Review supplier and reorder ${recommendedQty} units.`,
      reason: `Projected stockout based on paid-sales velocity (${forecast.avg_daily_sales.toFixed(2)}/day).`,
      confidence: forecast.confidence === 'high' ? 0.9 : forecast.confidence === 'medium' ? 0.7 : 0.5,
      risk_level: forecast.risk_level === 'critical' ? 3 : 2,
      status: 'recommended',
      is_stale: false,
      source_snapshot: {
        price: Number(product.price || 0),
        cost: unitCost,
        stock: forecast.stock_quantity,
        avg_daily_sales: forecast.avg_daily_sales,
        generated_at: new Date().toISOString(),
      },
      metadata: {
        suggested_quantity: recommendedQty,
        supplier_id: supplierId,
        supplier_name: supplier?.name || null,
        supplier_missing: !supplierId,
        estimated_cost: recommendedQty * unitCost,
        lead_time_days: leadTime,
        items: [{ product_id: product.id, product_name: product.name, sku: product.sku, quantity: recommendedQty, cost_price: unitCost, supplier_id: supplierId }],
      },
    };

    const { data, error } = await supabase
      .from('intelligence_recommendations')
      .upsert(recommendation as any, { onConflict: 'recommendation_type,entity_id,store_id' })
      .select()
      .single();
    if (error) console.error('[Intelligence] reorder recommendation:', error.message);
    return data;
  },

  async getCampaignInventoryHealth(productIds: string[]): Promise<Record<string, 'HEALTHY' | 'RISK' | 'CRITICAL'>> {
    const { data: inventory } = await supabase
      .from('central_inventory')
      .select('product_id,stock_quantity,low_stock_threshold')
      .in('product_id', productIds);
    const health: Record<string, 'HEALTHY' | 'RISK' | 'CRITICAL'> = {};
    (inventory || []).forEach((item: any) => {
      if (Number(item.stock_quantity || 0) <= 0) health[item.product_id] = 'CRITICAL';
      else if (Number(item.stock_quantity || 0) <= Number(item.low_stock_threshold || 5)) health[item.product_id] = 'RISK';
      else health[item.product_id] = 'HEALTHY';
    });
    return health;
  },

  async syncAllCustomerIntelligence(storeId?: string | null) {
    let query = supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .not('order_status', 'in', '("cancelled","refunded")')
      .order('created_at', { ascending: false });
    if (storeId) query = query.eq('store_id', storeId);

    const { data: orders, error } = await query;
    if (error || !orders) return { processed: 0, failed: 0 };

    const customerMap = new Map<string, any[]>();
    for (const order of orders) {
      const key = order.customer_email || order.customer_phone;
      if (!key) continue;
      if (!customerMap.has(key)) customerMap.set(key, []);
      customerMap.get(key)!.push(order);
    }

    let processed = 0;
    let failed = 0;
    const now = Date.now();
    for (const [key, customerOrders] of customerMap.entries()) {
      try {
        const stage = await this.calculateLifecycle(customerOrders as Order[]);
        const lifetimeValue = customerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const lastOrder = customerOrders[0];
        const recencyDays = Math.floor((now - new Date(lastOrder.created_at).getTime()) / 86400000);
        const rScore = recencyDays < 30 ? 5 : recencyDays < 60 ? 4 : recencyDays < 90 ? 3 : recencyDays < 180 ? 2 : 1;
        const fScore = customerOrders.length >= 10 ? 5 : customerOrders.length >= 5 ? 4 : customerOrders.length >= 3 ? 3 : customerOrders.length >= 2 ? 2 : 1;
        const mScore = lifetimeValue > 1000 ? 5 : lifetimeValue > 500 ? 4 : lifetimeValue > 200 ? 3 : lifetimeValue > 100 ? 2 : 1;
        const rfmScore = Math.round((rScore + fScore + mScore) / 3);
        const churnRisk = customerChurnService.calculateChurnRisk(customerOrders);
        const nba = await nextBestActionService.determineNBA(customerOrders);

        const intelData: any = {
          customer_key: key,
          customer_email: lastOrder.customer_email,
          customer_phone: lastOrder.customer_phone,
          recency_days: recencyDays,
          frequency: customerOrders.length,
          monetary_value: lifetimeValue,
          rfm_score: rfmScore,
          lifecycle_stage: stage,
          lifetime_value: lifetimeValue,
          order_count: customerOrders.length,
          last_order_at: lastOrder.created_at,
          last_calculated_at: new Date().toISOString(),
          store_id: storeId || null,
          calculation_scope: storeId ? 'store' : 'global',
          churn_probability: churnRisk?.probability || 0,
          risk_level: churnRisk?.risk_level?.toLowerCase() || 'low',
          avg_reorder_interval_days: churnRisk?.avg_interval_days || 0,
          health_score: Math.round((1 - Number(churnRisk?.probability || 0)) * 100),
        };

        const { error: intelError } = await supabase
          .from('customer_intelligence')
          .upsert(intelData, { onConflict: 'customer_key,store_id' });
        if (intelError) throw intelError;

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
            risk_level: 2,
            status: 'recommended',
            is_stale: false,
            metadata: { nba },
          }, { onConflict: 'recommendation_type,entity_id,store_id' });
        }
        processed += 1;
      } catch (syncError) {
        console.error('[Intelligence] customer sync:', syncError);
        failed += 1;
      }
    }
    return { processed, failed };
  },
};
