import { supabase } from '../supabase';
import { ProductService } from './productService';
import { formatCurrency } from '../utils/currency';

export interface Competitor {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string | null;
  created_at: string;
  is_active?: boolean;
  scan_frequency?: string;
  last_successful_scan_at?: string | null;
  last_scan_status?: string | null;
  last_scan_at?: string | null;
  discovery_status?: string;
  discovery_progress?: any;
  last_discovery_at?: string | null;
}

export interface CompetitorPrice {
  id: string;
  product_id: string;
  competitor_id: string;
  price: number;
  product_url: string | null;
  auto_scan_enabled: boolean;
  last_scanned_at: string | null;
  scan_status: string | null;
  scan_error: string | null;
  extraction_status: string | null;
  match_confidence: number | null;
  match_status: string | null;
  source_product_name: string | null;
  source_brand: string | null;
  source_size: string | null;
  source_variant: string | null;
  source_stock_status: string | null;
  source_unit_value: number | null;
  source_unit_type: string | null;
  normalised_price_per_kg: number | null;
  data_quality_state: string;
  match_method: string | null;
  brand_match: boolean | null;
  size_match: boolean | null;
  product_type_match: boolean | null;
  ai_used: boolean | null;
  ai_model: string | null;
  shipping_fee: number;
  is_conditional: boolean;
  created_at: string;
  updated_at: string;
  competitor_name: string;
  product_name: string;
  product_sku: string | null;
  product_price: number;
  product_cost_price: number | null;
  product_image_url: string | null;
}

export interface CatalogItem {
  id: string;
  competitor_id: string;
  matched_product_id: string | null;
  name: string;
  price: number | null;
  product_url: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  competitor_name: string;
  matched_product_name: string | null;
  matched_brand: string | null;
  matched_price: number | null;
  confidence_score: number | null;
  match_reasons: string[] | null;
  match_method: string | null;
  brand_match: boolean | null;
  size_match: boolean | null;
  product_type_match: boolean | null;
  ai_used: boolean | null;
  ai_model: string | null;
  matched_at: string | null;
}

export interface ScannedCatalogProduct {
  name: string;
  price: number | null;
  product_url: string | null;
  image_url: string | null;
}

export type PricingStrategy = 'aggressive' | 'moderate' | 'premium';

export interface PriceSuggestion {
  id?: string;
  product_id: string;
  current_price: number;
  suggested_price: number;
  cost_price: number | null;
  minimum_allowed_price: number | null;
  lowest_competitor_price: number | null;
  highest_competitor_price: number | null;
  average_market_price: number | null;
  median_market_price: number | null;
  competitor_count: number;
  strategy: PricingStrategy;
  expected_profit: number | null;
  expected_margin: number | null;
  price_difference: number | null;
  percentage_difference: number | null;
  recommendation_status: 'ready' | 'review_required' | 'applied' | 'rejected' | 'suspicious' | 'stale';
  market_position?: 'CHEAPEST' | 'BELOW_MARKET' | 'MARKET_ALIGNED' | 'ABOVE_MARKET' | 'PREMIUM' | 'NO_VALID_DATA';
  reason: string | null;
  in_stock_competitor_count?: number;
  our_stock?: number;
  days_of_cover?: number;
}

class CompetitorService {
  async getAllCompetitors(): Promise<Competitor[]> {
    const { data, error } = await supabase
      .from('competitors')
      .select('*')
      .order('name');
    if (error) { console.error('getAllCompetitors error:', error); return []; }
    return data || [];
  }

  async addCompetitor(name: string, websiteUrl?: string): Promise<Competitor | null> {
    const { data, error } = await supabase
      .from('competitors')
      .insert({ name: name.trim(), website_url: websiteUrl || null })
      .select()
      .single();
    if (error) { console.error('addCompetitor error:', error); return null; }
    return data;
  }

  async deleteCompetitor(id: string): Promise<boolean> {
    const { error } = await supabase.from('competitors').delete().eq('id', id);
    if (error) { console.error('deleteCompetitor error:', error); return false; }
    return true;
  }

  async updateCompetitor(id: string, updates: { name?: string; website_url?: string; is_active?: boolean; scan_frequency?: string }): Promise<boolean> {
    const { error } = await supabase.from('competitors').update(updates).eq('id', id);
    if (error) { console.error('updateCompetitor error:', error); return false; }
    return true;
  }

  async scanSingleUrl(url: string, competitorPriceId?: string): Promise<any> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'scan_single', url, competitorPriceId }),
      });
      return await response.json();
    } catch (err: any) { return { success: false, error: err.message }; }
  }

  async scanCompetitor(competitorId: string): Promise<any> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'scan_competitor', competitor_id: competitorId }),
      });
      return await response.json();
    } catch (err: any) { return { success: false, error: err.message }; }
  }

  async getScanHistory(limit: number = 50): Promise<any[]> {
    const { data, error } = await supabase
      .from('competitor_audit_logs')
      .select(`
        id, action, details, created_at,
        competitor:competitors(name),
        competitor_price_id
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('getScanHistory error:', error); return []; }
    return data || [];
  }

  async getPriceHistoryByUrl(productUrl: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('competitor_price_history')
      .select('*')
      .eq('source_url', productUrl)
      .order('detected_at', { ascending: false })
      .limit(20);
    if (error) { console.error('getPriceHistoryByUrl error:', error); return []; }
    return data || [];
  }

  async getCatalogItemsByCompetitor(competitorId: string): Promise<CatalogItem[]> {
    const items = await this.getCatalogItems();
    return items.filter(i => i.competitor_id === competitorId);
  }

  async getAllPrices(filters?: { searchTerm?: string; storeId?: string | null }): Promise<CompetitorPrice[]> {
    let query = supabase
      .from('competitor_prices')
      .select(`
        id,
        product_id,
        competitor_id,
        price,
        product_url,
        auto_scan_enabled,
        last_scanned_at,
        scan_status,
        scan_error,
        extraction_status,
        match_confidence,
        match_status,
        source_product_name,
        source_brand,
        source_size,
        source_variant,
        source_stock_status,
        source_unit_value,
        source_unit_type,
        normalised_price_per_kg,
        data_quality_state,
        shipping_fee,
        is_conditional,
        created_at,
        updated_at,
        competitor:competitors (
          name
        ),
        product:products (
          name,
          sku,
          price,
          cost_price,
          image_url,
          min_margin,
          target_margin,
          category_id,
          is_active
        )
      `);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('getAllPrices error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return [];
    }
    if (!data) return [];

    let rows: CompetitorPrice[] = data.map((row: any) => {
      // Extremely flexible mapping to handle any relation naming/structure from Supabase
      const compRaw = row.competitor || row.competitors;
      const prodRaw = row.product || row.products;

      const comp = Array.isArray(compRaw) ? compRaw[0] : compRaw;
      const prod = Array.isArray(prodRaw) ? prodRaw[0] : prodRaw;

      return {
        id: row.id,
        product_id: row.product_id,
        competitor_id: row.competitor_id,
        price: Number(row.price) || 0,
        product_url: row.product_url,
        auto_scan_enabled: row.auto_scan_enabled || false,
        last_scanned_at: row.last_scanned_at,
        scan_status: row.scan_status,
        scan_error: row.scan_error,
        extraction_status: row.extraction_status,
        match_confidence: row.match_confidence,
        match_status: row.match_status,
        source_product_name: row.source_product_name,
        source_brand: row.source_brand,
        source_size: row.source_size,
        source_variant: row.source_variant,
        source_stock_status: row.source_stock_status,
        source_unit_value: row.source_unit_value ? Number(row.source_unit_value) : null,
        source_unit_type: row.source_unit_type,
        normalised_price_per_kg: row.normalised_price_per_kg ? Number(row.normalised_price_per_kg) : null,
        data_quality_state: row.data_quality_state || 'FRESH',
        match_method: row.match_method,
        brand_match: row.brand_match,
        size_match: row.size_match,
        product_type_match: row.product_type_match,
        ai_used: row.ai_used,
        ai_model: row.ai_model,
        shipping_fee: Number(row.shipping_fee || 0),
        is_conditional: row.is_conditional || false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        competitor_name: comp?.name || row.competitor_name || 'Unknown',
        product_name: prod?.name || row.product_name || 'Unknown',
        product_sku: prod?.sku || null,
        product_price: Number(prod?.price) || 0,
        product_cost_price: prod?.cost_price != null ? Number(prod.cost_price) : null,
        product_image_url: prod?.image_url || null,
      };
    });

    if (filters?.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.product_name.toLowerCase().includes(term) ||
        r.competitor_name.toLowerCase().includes(term) ||
        (r.product_sku || '').toLowerCase().includes(term)
      );
    }
    return rows;
  }

  async getAllCategories(): Promise<any[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, default_strategy, min_margin')
      .is('parent_id', null)
      .order('name');
    return data || [];
  }

  async updateCategoryStrategy(categoryId: string, strategy: string, minMargin?: number): Promise<boolean> {
    const { error } = await supabase
      .from('categories')
      .update({ default_strategy: strategy, min_margin: minMargin })
      .eq('id', categoryId);
    return !error;
  }

  async upsertPrice(entry: {
    product_id: string;
    competitor_id: string;
    price?: number | null;
    product_url?: string;
    auto_scan_enabled?: boolean;
    match_status?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!entry.product_id || !entry.competitor_id) return { success: false, error: 'Missing IDs' };

    const priceValue = entry.price != null ? entry.price : 0;

    const upsertData: any = {
      product_id: entry.product_id,
      competitor_id: entry.competitor_id,
      price: priceValue,
      product_url: entry.product_url || null,
      auto_scan_enabled: entry.auto_scan_enabled ?? false,
      updated_at: new Date().toISOString(),
    };

    if (entry.match_status) {
      upsertData.match_status = entry.match_status;
    }

    const { error } = await supabase
      .from('competitor_prices')
      .upsert(upsertData, { onConflict: 'product_id,competitor_id' });

    if (error) {
      console.error('upsertPrice error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async deletePrice(id: string): Promise<boolean> {
    const { error } = await supabase.from('competitor_prices').delete().eq('id', id);
    if (error) { console.error('deletePrice error:', error); return false; }
    return true;
  }

  async getPricingSuggestions(): Promise<PriceSuggestion[]> {
      const { data, error } = await supabase
        .from('pricing_suggestions')
        .select('*')
        .order('generated_at', { ascending: false });

      if (error) {
          console.error('getPricingSuggestions error:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          return [];
      }
      return (data || []).map(row => ({
          ...row,
          strategy: row.strategy as PricingStrategy
      }));
  }

  async generateRecommendations(strategy?: PricingStrategy): Promise<PriceSuggestion[]> {
      const prices = await this.getAllPrices();

      // Group by CentralHub product
      const productGroups = new Map<string, CompetitorPrice[]>();
      prices.forEach(p => {
          if (!productGroups.has(p.product_id)) productGroups.set(p.product_id, []);
          productGroups.get(p.product_id)!.push(p);
      });

      // Get global pricing settings (CentralHub pricing is not store-specific)
      const { data: settings } = await supabase
        .from('pricing_settings')
        .select('*')
        .is('store_id', null)
        .limit(1)
        .maybeSingle();

      const undercutAmount = Number(settings?.competitor_undercut_amount ?? 0.10);
      const dailyTarget = Number(settings?.daily_target_net_profit ?? 100);
      const salesWindowDays = Number(settings?.expected_sales_window_days ?? 30);
      const freshnessWindowHours = Number(settings?.competitor_freshness_window_hours ?? 48);

      const suggestions: PriceSuggestion[] = [];

      for (const [productId, compPrices] of productGroups.entries()) {
          const { data: product } = await supabase
            .from('products')
            .select(`
              name, price, cost_price, min_margin, target_margin, category_id,
              categories(min_margin, default_strategy)
            `)
            .eq('id', productId)
            .single();

          if (!product) continue;

          // 1. FILTER FOR VERIFIED MATCHES ONLY
          const verifiedComps = compPrices.filter(cp =>
              cp.scan_status === 'success' &&
              (cp.match_status === 'automatic' || cp.match_status === 'manual') &&
              cp.brand_match === true &&
              cp.size_match === true &&
              cp.product_type_match === true &&
              !cp.is_conditional
          ).map(cp => ({
              ...cp,
              landed_price: Number(cp.price) + Number(cp.shipping_fee || 0),
              is_oos: ['out of stock', 'outofstock', 'unavailable'].includes((cp.source_stock_status || '').toLowerCase()),
              age_hours: cp.last_scanned_at ? (Date.now() - new Date(cp.last_scanned_at).getTime()) / (1000 * 60 * 60) : 999
          }));

          // 2. FRESHNESS CHECK
          const freshComps = verifiedComps.filter(cp => cp.age_hours < freshnessWindowHours);

          // 3. STOCK-AWARE FILTER
          const inStockComps = freshComps.filter(cp => !cp.is_oos);

          const cost = product.cost_price != null ? Number(product.cost_price) : null;
          const currentPrice = Number(product.price);

          // 4. MISSING COST DATA PROTECTION
          if (cost === null || cost <= 0) {
              const suggestion: any = {
                  product_id: productId,
                  current_price: currentPrice,
                  suggested_price: currentPrice,
                  cost_price: cost,
                  minimum_allowed_price: null,
                  lowest_competitor_price: null,
                  highest_competitor_price: null,
                  average_market_price: null,
                  median_market_price: null,
                  competitor_count: 0,
                  in_stock_competitor_count: 0,
                  strategy: strategy || 'moderate',
                  expected_profit: null,
                  expected_margin: null,
                  price_difference: 0,
                  percentage_difference: 0,
                  recommendation_status: 'review_required',
                  market_position: 'NO_VALID_DATA',
                  reason: 'MISSING_COST: Product cost data is missing. Automatic pricing blocked.',
                  decision_reason: 'MISSING_COST',
              };
              suggestions.push(suggestion);
              continue;
          }

          // Call server-side pricing engine RPC
          const { data: engineResult, error: engineError } = await supabase
            .rpc('calculate_required_profit_price', {
              p_product_id: productId,
              p_daily_target: dailyTarget,
              p_sales_window_days: salesWindowDays,
              p_undercut_amount: undercutAmount,
            });

          if (engineError) {
            console.error(`[PriceEngine] RPC error for ${product.name}:`, engineError);
            continue;
          }

          const engine = engineResult as any;
          if (!engine || engine.error) {
            console.error(`[PriceEngine] Engine returned error for ${product.name}:`, engine?.error);
            continue;
          }

          // 5. CHECK PRICE LOCK
          const { data: lock } = await supabase
            .from('price_locks')
            .select('locked_price, lock_reason')
            .eq('product_id', productId)
            .eq('is_active', true)
            .maybeSingle();

          if (lock) {
              const suggestion: any = {
                  product_id: productId,
                  current_price: currentPrice,
                  suggested_price: Number(lock.locked_price),
                  cost_price: cost,
                  minimum_allowed_price: engine.margin_floor_price,
                  lowest_competitor_price: engine.lowest_competitor,
                  highest_competitor_price: inStockComps.length > 0 ? Math.max(...inStockComps.map(c => c.landed_price)) : null,
                  average_market_price: inStockComps.length > 0 ? inStockComps.reduce((s, c) => s + c.landed_price, 0) / inStockComps.length : null,
                  median_market_price: inStockComps.length > 0 ? inStockComps.map(c => c.landed_price).sort((a, b) => a - b)[Math.floor(inStockComps.length / 2)] : null,
                  competitor_count: inStockComps.length,
                  in_stock_competitor_count: inStockComps.length,
                  strategy: strategy || 'moderate',
                  expected_profit: Number(lock.locked_price) - cost,
                  expected_margin: Number(lock.locked_price) > 0 ? ((Number(lock.locked_price) - cost) / Number(lock.locked_price)) * 100 : 0,
                  price_difference: Number(lock.locked_price) - currentPrice,
                  percentage_difference: currentPrice > 0 ? ((Number(lock.locked_price) - currentPrice) / currentPrice) * 100 : 0,
                  recommendation_status: 'review_required',
                  market_position: 'MANUAL_OVERRIDE',
                  reason: `MANUAL_OVERRIDE: Price is locked at ${formatCurrency(Number(lock.locked_price))}. ${lock.lock_reason || ''}`,
                  decision_reason: 'MANUAL_OVERRIDE',
                  competitive_target_price: engine.competitive_target,
                  required_profit_price: engine.required_profit_price,
                  final_price: Number(lock.locked_price),
                  target_profit_contribution: engine.target_profit_per_unit,
                  allocated_overhead: engine.daily_overhead,
                  competitor_data_age_hours: inStockComps.length > 0 ? Math.min(...inStockComps.map(c => c.age_hours)) : null,
              };
              suggestions.push(suggestion);
              continue;
          }

          if (inStockComps.length === 0) {
              // No valid competitor data - use profit-only calculation
              const suggestion: any = {
                  product_id: productId,
                  current_price: currentPrice,
                  suggested_price: engine.final_recommended_price || currentPrice,
                  cost_price: cost,
                  minimum_allowed_price: engine.margin_floor_price,
                  lowest_competitor_price: null,
                  highest_competitor_price: null,
                  average_market_price: null,
                  median_market_price: null,
                  competitor_count: 0,
                  in_stock_competitor_count: 0,
                  strategy: strategy || 'moderate',
                  expected_profit: (engine.final_recommended_price || currentPrice) - cost,
                  expected_margin: (engine.final_recommended_price || currentPrice) > 0 ? (((engine.final_recommended_price || currentPrice) - cost) / (engine.final_recommended_price || currentPrice)) * 100 : 0,
                  price_difference: (engine.final_recommended_price || currentPrice) - currentPrice,
                  percentage_difference: currentPrice > 0 ? (((engine.final_recommended_price || currentPrice) - currentPrice) / currentPrice) * 100 : 0,
                  recommendation_status: 'review_required',
                  market_position: 'NO_VALID_DATA',
                  reason: 'NO_VALID_COMPETITOR_DATA: No fresh verified in-stock competitor data available.',
                  decision_reason: 'NO_VALID_COMPETITOR_DATA',
                  competitive_target_price: null,
                  required_profit_price: engine.required_profit_price,
                  final_price: engine.final_recommended_price,
                  target_profit_contribution: engine.target_profit_per_unit,
                  allocated_overhead: engine.daily_overhead,
                  competitor_data_age_hours: null,
              };
              suggestions.push(suggestion);
              continue;
          }

          const landedPrices = inStockComps.map(v => v.landed_price).sort((a, b) => a - b);
          const lowestLanded = landedPrices[0];
          const highestLanded = landedPrices[landedPrices.length - 1];
          const avgLanded = landedPrices.reduce((s, p) => s + p, 0) / landedPrices.length;
          const medianLanded = landedPrices.length % 2 === 0
            ? (landedPrices[landedPrices.length / 2 - 1] + landedPrices[landedPrices.length / 2]) / 2
            : landedPrices[Math.floor(landedPrices.length / 2)];

          const suggested = Number(engine.final_recommended_price);
          const competitiveTarget = engine.competitive_target ? Number(engine.competitive_target) : null;
          const requiredProfitPrice = engine.required_profit_price ? Number(engine.required_profit_price) : null;
          const diff = suggested - currentPrice;
          const diffPct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;

          // 7. PRICE POSITION CLASSIFICATION
          let position: any = 'MARKET_ALIGNED';
          const posDiffPct = ((currentPrice - medianLanded) / medianLanded) * 100;
          if (currentPrice < lowestLanded) position = 'CHEAPEST';
          else if (posDiffPct < -3) position = 'BELOW_MARKET';
          else if (posDiffPct > 15) position = 'PREMIUM';
          else if (posDiffPct > 3) position = 'ABOVE_MARKET';

          let reasonText = '';
          switch (engine.decision_reason) {
            case 'COMPETE_BELOW_LOWEST':
              reasonText = `Competing ${formatCurrency(undercutAmount)} below lowest verified competitor (${formatCurrency(lowestLanded)}). Competitive target: ${formatCurrency(competitiveTarget!)}.`;
              break;
            case 'PROTECT_REQUIRED_PROFIT':
              reasonText = `Competitor target ${formatCurrency(competitiveTarget!)} rejected because it would reduce required profitability. Profit floor: ${formatCurrency(requiredProfitPrice!)}.`;
              break;
            case 'PROTECT_MINIMUM_MARGIN':
              reasonText = `Margin floor protection activated. Minimum margin maintained.`;
              break;
            case 'NO_VALID_COMPETITOR_DATA':
              reasonText = `No valid competitor data available. Using profit-only calculation.`;
              break;
            case 'MISSING_SALES_FORECAST':
              reasonText = `Missing sales forecast. Profit allocation may be inaccurate - requires review.`;
              break;
            case 'MISSING_COST':
              reasonText = `Missing cost data. Automatic pricing blocked.`;
              break;
            default:
              reasonText = `Decision: ${engine.decision_reason}`;
          }

          const suggestion: any = {
              product_id: productId,
              current_price: currentPrice,
              suggested_price: suggested,
              cost_price: cost,
              minimum_allowed_price: engine.margin_floor_price,
              lowest_competitor_price: lowestLanded,
              highest_competitor_price: highestLanded,
              average_market_price: avgLanded,
              median_market_price: medianLanded,
              competitor_count: inStockComps.length,
              in_stock_competitor_count: inStockComps.length,
              strategy: strategy || 'moderate',
              expected_profit: suggested - cost,
              expected_margin: suggested > 0 ? ((suggested - cost) / suggested) * 100 : 0,
              price_difference: diff,
              percentage_difference: diffPct,
              recommendation_status: 'ready',
              market_position: position,
              reason: `[${position}] ${reasonText}`,
              decision_reason: engine.decision_reason,
              competitive_target_price: competitiveTarget,
              required_profit_price: requiredProfitPrice,
              final_price: suggested,
              target_profit_contribution: engine.target_profit_per_unit,
              allocated_overhead: engine.daily_overhead,
              competitor_data_age_hours: Math.min(...inStockComps.map(c => c.age_hours)),
              cheapest_competitor_name: engine.market_analytics?.cheapest_competitor_name || null,
          };

          suggestions.push(suggestion);
      }

      // 8. PERSISTENCE
      // 8. PERSISTENCE (CentralHub pricing only - no store_id)
      for (const s of suggestions) {
          const { store_id, ...data } = s as any;

          await supabase.from('pricing_suggestions').upsert({
              ...data,
              generated_at: new Date().toISOString()
          }, { onConflict: 'product_id' });

          const type = (s.price_difference || 0) > 0 ? 'PRICE INCREASE OPPORTUNITY' : (s.price_difference || 0) < 0 ? 'PRICE DECREASE OPPORTUNITY' : 'PRICE MAINTAIN';

          await supabase.from('intelligence_recommendations').upsert({
            recommendation_type: 'pricing_opportunity',
            entity_type: 'product',
            entity_id: s.product_id,
            title: `${type}: ${productGroups.get(s.product_id)?.[0]?.product_name || 'Product'}`,
            description: s.reason,
            proposed_action: `Update CentralHub price from ${formatCurrency(s.current_price)} to ${formatCurrency(s.suggested_price)}`,
            expected_impact: `Projected Margin: ${s.expected_margin?.toFixed(1)}% | Profit Delta: ${formatCurrency(s.price_difference)}`,
            confidence: ((s.in_stock_competitor_count || 0) > 1 ? 0.95 : 0.85),
            status: 'recommended',
            metadata: {
              proposed_price: s.suggested_price,
              current_price: s.current_price,
              cost_price: s.cost_price,
              price_diff: s.price_difference,
              margin: s.expected_margin,
              competitor_median: s.median_market_price,
              decision_reason: s.decision_reason,
              competitive_target: s.competitive_target_price,
              required_profit_price: s.required_profit_price,
              final_price: s.final_price,
            },
            source_snapshot: {
              price: s.current_price,
              cost: s.cost_price,
              competitor_median: s.median_market_price,
              scan_count: s.in_stock_competitor_count || 0
            }
          }, { onConflict: 'recommendation_type, entity_id' });
      }

      return suggestions;
  }


  async applySuggestion(suggestionId: string, performedBy?: string): Promise<{ success: boolean; error?: string }> {
      const { data: suggestion } = await supabase.from('pricing_suggestions').select('*').eq('id', suggestionId).single();
      if (!suggestion) return { success: false, error: 'Suggestion not found' };

      // 1. STALE DATA PROTECTION
      const safety = await this.verifyRecommendationSafety(suggestion);
      if (!safety.isSafe) {
          await supabase.from('pricing_suggestions').update({ recommendation_status: 'stale' }).eq('id', suggestionId);
          return { success: false, error: `Recommendation is stale: ${safety.reason}. Recalculate before approval.` };
      }

      try {
          // 2. UPDATE CENTRALHUB MASTER PRODUCT PRICE ONLY
          // This pricing engine manages ONLY the CentralHub product price.
          // It does NOT update store_products, store-specific overrides, or any store catalogue.
          await ProductService.updateProduct(suggestion.product_id, { price: Number(suggestion.suggested_price) });

          // 3. AUDIT
          await supabase.from('price_change_audit').insert({
              product_id: suggestion.product_id,
              old_price: suggestion.current_price,
              new_price: suggestion.suggested_price,
              competitive_target: suggestion.competitive_target_price || null,
              required_profit_price: suggestion.required_profit_price || null,
              final_price: suggestion.final_price || suggestion.suggested_price,
              lowest_competitor: suggestion.lowest_competitor_price || null,
              average_competitor: suggestion.average_market_price || null,
              target_profit: suggestion.target_profit_contribution || null,
              allocated_overhead: suggestion.allocated_overhead || null,
              product_cost: suggestion.cost_price || null,
              strategy: suggestion.strategy,
              decision_reason: suggestion.decision_reason || suggestion.reason,
              initiated_by: performedBy,
              manually_approved: true,
              automatically_applied: false,
          });

          await supabase.from('pricing_suggestions').update({
              recommendation_status: 'applied',
              applied_at: new Date().toISOString(),
              applied_by: performedBy,
              publication_status: 'pending',
          }).eq('id', suggestion.id);

          // Update intelligence recommendation status too
          await supabase.from('intelligence_recommendations')
            .update({ status: 'executed', actioned_at: new Date().toISOString() })
            .eq('recommendation_type', 'pricing_opportunity')
            .eq('entity_id', suggestion.product_id);

          return { success: true };
      } catch (e: any) { return { success: false, error: e.message }; }
  }

  /**
   * Stale Data Protection
   * Re-verifies all relevant values before any price change execution
   */
  private async verifyRecommendationSafety(s: any): Promise<{ isSafe: boolean; reason?: string }> {
      const { data: p } = await supabase.from('products').select('price, cost_price, is_deleted, is_active').eq('id', s.product_id).single();
      if (!p || p.is_deleted || !p.is_active) return { isSafe: false, reason: 'Product is no longer active' };

      // PRICE LOCK CHECK — block if any active lock exists (global or store-specific)
      const { data: locks } = await supabase.from('price_locks')
        .select('id, locked_price, store_id, lock_reason')
        .eq('product_id', s.product_id)
        .eq('is_active', true)
        .limit(1);
      if (locks && locks.length > 0) {
        return { isSafe: false, reason: 'PRICE_LOCKED' };
      }

      // Check if price changed since generation
      if (Number(p.price) !== Number(s.current_price)) {
          return { isSafe: false, reason: `Our price changed (${formatCurrency(s.current_price)} -> ${formatCurrency(p.price)})` };
      }

      // Check if cost changed
      if (Number(p.cost_price) !== Number(s.cost_price)) {
          return { isSafe: false, reason: 'Product cost changed' };
      }

      // Check for competitor data age - accept both automatic and manual verified matches
      const { data: compPrices } = await supabase.from('competitor_prices')
        .select('price, last_scanned_at, shipping_fee, match_status')
        .eq('product_id', s.product_id)
        .in('match_status', ['automatic', 'manual'])
        .order('last_scanned_at', { ascending: false, nullsFirst: false });

      // If no verified competitor data, allow application for profit-only recommendations
      if (!compPrices || compPrices.length === 0) {
        // No competitor data - allow if the recommendation is profit-based
        return { isSafe: true };
      }

      // Check freshness of most recent scan
      const latestScan = compPrices[0].last_scanned_at;
      if (latestScan) {
        const ageHours = (Date.now() - new Date(latestScan).getTime()) / (1000 * 60 * 60);
        if (ageHours > 72) return { isSafe: false, reason: 'Competitor data is older than 72 hours' };
      }

      return { isSafe: true };
  }

  async applyRecommendation(productId: string): Promise<{ success: boolean; error?: string; newPrice?: number }> {
    const { data: suggestion } = await supabase
      .from('pricing_suggestions')
      .select('*')
      .eq('product_id', productId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!suggestion) {
      return { success: false, error: 'No recommendation found. Click Refresh Recommendations first.' };
    }

    if (suggestion.recommendation_status === 'applied') {
      return { success: false, error: 'This recommendation has already been applied.' };
    }

    if (suggestion.decision_reason === 'MISSING_COST' || suggestion.decision_reason === 'MANUAL_OVERRIDE') {
      return { success: false, error: `Cannot apply: ${suggestion.decision_reason}` };
    }

    const result = await this.applySuggestion(suggestion.id, 'admin');
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, newPrice: Number(suggestion.suggested_price) };
  }

  async updateProductPrice(productId: string, newPrice: number): Promise<boolean> {
    const { error } = await supabase.from('products').update({ price: newPrice, updated_at: new Date().toISOString() }).eq('id', productId);
    return !error;
  }

  /**
   * @deprecated Use generateRecommendations() instead, which calls the server-side
   * calculate_required_profit_price RPC with full safety checks (freshness, match
   * verification, margin floor, price locks). This client-side calculation does NOT
   * enforce those checks and should not be used for authoritative pricing.
   */
  suggestPrice(
    costPrice: number | null,
    currentPrice: number,
    competitorPrices: number[],
    strategy: PricingStrategy,
    avgGatewayFee = 0, avgPackingCost = 0, avgShippingCost = 0,
    undercutAmount = 0.10,
  ): PriceSuggestion {
    const totalCost = (costPrice || 0) + avgGatewayFee + avgPackingCost + avgShippingCost;
    if (competitorPrices.length === 0) {
      return { product_id: '', strategy, recommendation_status: 'ready', reason: 'No competitors', suggested_price: currentPrice, expected_profit: currentPrice - totalCost, expected_margin: currentPrice > 0 ? ((currentPrice - totalCost) / currentPrice) * 100 : 0, current_price: currentPrice, cost_price: costPrice, minimum_allowed_price: totalCost, lowest_competitor_price: null, highest_competitor_price: null, average_market_price: null, median_market_price: null, competitor_count: 0, price_difference: 0, percentage_difference: 0 };
    }
    const sorted = [...competitorPrices].filter(p => p > 0).sort((a, b) => a - b);
    const cheapest = sorted[0];
    const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
    // NEW STRATEGY: Undercut lowest competitor by fixed amount
    const competitiveTarget = Math.max(0.01, cheapest - undercutAmount);
    const profitFloor = totalCost * 1.08;
    // FINAL = MAX(competitive_target, profit_floor)
    let suggested = Math.max(competitiveTarget, profitFloor);
    suggested = Math.round(suggested * 100) / 100;
    return { product_id: '', strategy, recommendation_status: 'ready', reason: `Undercut target: ${formatCurrency(competitiveTarget)} | Profit floor: ${formatCurrency(profitFloor)}`, suggested_price: suggested, expected_profit: suggested - totalCost, expected_margin: suggested > 0 ? ((suggested - totalCost) / suggested) * 100 : 0, current_price: currentPrice, cost_price: costPrice, minimum_allowed_price: profitFloor, lowest_competitor_price: cheapest, highest_competitor_price: sorted[sorted.length - 1], average_market_price: avg, median_market_price: median, competitor_count: competitorPrices.length, price_difference: suggested - currentPrice, percentage_difference: currentPrice > 0 ? ((suggested - currentPrice) / currentPrice) * 100 : 0 };
  }

  async fetchSinglePrice(url: string): Promise<{ success: boolean; price?: number; error?: string }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` }, body: JSON.stringify({ action: 'scan_single', url }) });
      const result = await response.json();
      return result.success ? { success: true, price: result.price } : { success: false, error: result.error };
    } catch (err: any) { return { success: false, error: err.message }; }
  }

  async fetchProductPageData(url: string): Promise<any> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` }, body: JSON.stringify({ action: 'scan_product_page', url }) });
      const result = await response.json();
      return result;
    } catch (err: any) { return { success: false, error: err.message }; }
  }

  findCompetitorByDomain(url: string, competitors: Competitor[]): Competitor | null {
    try {
      const inputHost = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

      // 1. Exact hostname match
      let match = competitors.find(c => {
        if (!c.website_url) return false;
        try {
          const compHost = new URL(c.website_url).hostname.replace(/^www\./, '').toLowerCase();
          return compHost === inputHost;
        } catch { return false; }
      });
      if (match) return match;

      // 2. Legitimate subdomain match: input is a subdomain of a configured competitor domain
      // e.g. configured=example.com, input=shop.example.com → match
      // But notexample.com must NOT match example.com
      match = competitors.find(c => {
        if (!c.website_url) return false;
        try {
          const compHost = new URL(c.website_url).hostname.replace(/^www\./, '').toLowerCase();
          // Check that inputHost ends with '.<compHost>' (proper domain boundary)
          return inputHost.endsWith('.' + compHost);
        } catch { return false; }
      });
      return match || null;
    } catch { return null; }
  }

  matchProducts(searchText: string, products: any[], limit = 5): any[] {
    const searchWords = searchText.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length === 0) return [];

    // Critical food keyword groups - products from different groups must never match
    const CRITICAL_GROUPS: Record<string, string[]> = {
      rice: ['rice', 'pathiri', 'idiyappam', 'puttu'],
      flour: ['flour', 'atta', 'maida', 'sooji', 'rava'],
      flakes: ['flakes', 'poha', 'aval', 'beaten'],
      chicken: ['chicken', 'poultry', 'hen'],
      fish: ['fish', 'tuna', 'mackerel', 'sardine', 'prawns', 'shrimp', 'anchovy'],
      beef: ['beef', 'lamb', 'mutton', 'goat'],
      mango: ['mango', 'mangga'],
      lime: ['lime', 'lemon'],
      coconut: ['coconut', 'kerala'],
      oil: ['oil', 'gingelly', 'sesame', 'coconut oil', 'mustard oil'],
      spice: ['masala', 'powder', 'chilli', 'turmeric', 'coriander', 'garam'],
      pickle: ['pickle', 'achar', 'pickle'],
      snack: ['snack', 'chips', 'namkeen', 'mixture'],
      drink: ['juice', 'drink', 'soda', 'water'],
      dairy: ['milk', 'cheese', 'butter', 'ghee', 'yogurt', 'curd'],
      lentil: ['dal', 'lentil', 'toor', 'moong', 'urad', 'chana'],
    };

    const getGroup = (text: string): string | null => {
      const lower = text.toLowerCase();
      for (const [group, keywords] of Object.entries(CRITICAL_GROUPS)) {
        if (keywords.some(kw => lower.includes(kw))) return group;
      }
      return null;
    };

    const searchGroup = getGroup(searchText);

    return products.map(p => {
      let score = 0;
      const pName = p.name.toLowerCase();

      // Hard rejection: different critical food groups
      const pGroup = getGroup(p.name);
      if (searchGroup && pGroup && searchGroup !== pGroup) {
        return { ...p, score: 0, rejected: true, rejectReason: `Type mismatch: ${searchGroup} vs ${pGroup}` };
      }

      // Hard rejection: brand mismatch (if both have known brands)
      const searchBrandMatch = searchText.match(/\b([a-z]{3,})\b/i);
      if (searchBrandMatch && p.brand) {
        const searchBrand = searchBrandMatch[1].toLowerCase();
        const pBrand = p.brand.toLowerCase();
        if (searchBrand.length >= 4 && pBrand.length >= 4 && !searchBrand.includes(pBrand) && !pBrand.includes(searchBrand)) {
          return { ...p, score: 0, rejected: true, rejectReason: `Brand mismatch: ${searchBrand} vs ${pBrand}` };
        }
      }

      searchWords.forEach(w => {
        if (pName.includes(w)) score += 1;
      });
      return { ...p, score };
    }).filter(s => s.score > 0 && !s.rejected).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async fetchCatalogPage(url: string): Promise<any> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` }, body: JSON.stringify({ action: 'scan_catalog_page', url }) });
      return await response.json();
    } catch (err: any) { return { success: false, error: err.message }; }
  }

  async saveCatalogItems(competitorId: string, items: any[]): Promise<any> {
    let saved = 0, matched = 0, unmatched = 0, errors: string[] = [];
    for (const item of items) {
      const matchedProductId = item.matched_product_id;
      const status = matchedProductId ? 'price_analysis' : 'purchase_opportunity';

      const { error: catError } = await supabase.from('competitor_catalog_items').upsert({
        competitor_id: competitorId,
        matched_product_id: matchedProductId,
        name: item.name,
        price: item.price ?? null,
        product_url: item.product_url,
        image_url: item.image_url || null,
        status,
        confidence_score: item.confidence ?? null,
        match_reasons: item.match_reasons || null,
        match_method: item.match_method || null,
        brand_match: item.brand_match ?? null,
        size_match: item.size_match ?? null,
        product_type_match: item.product_type_match ?? null,
        ai_used: item.ai_used || false,
        ai_model: item.ai_model || null,
        source_brand: item.source_brand || item.brand || null,
        source_sku: item.source_sku || item.sku || null,
        source_gtin: item.source_gtin || item.gtin || null,
        source_size: item.source_size || (item.size ? String(item.size) : null),
        source_unit: item.source_unit || item.unit || null,
        source_currency: item.source_currency || item.currency || 'GBP',
        source_regular_price: item.source_regular_price || item.regular_price || null,
        source_sale_price: item.source_sale_price || item.sale_price || null,
        source_availability: item.source_availability || item.availability || null,
        source_image_url: item.source_image_url || item.image_url || null,
        last_scanned_at: new Date().toISOString(),
        matched_at: matchedProductId ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'competitor_id,product_url' });

      if (catError) {
        console.error(`[CompetitorService] Catalog Upsert Failed for ${item.name}:`, catError.message);
        errors.push(`Catalog Error [${item.name}]: ${catError.message}`);
        continue;
      }

      saved++;
      if (matchedProductId && (item.confidence ?? 0) >= 80) {
        matched++;
        if (item.price != null) {
          const res = await this.upsertPrice({
            product_id: matchedProductId,
            competitor_id: competitorId,
            price: item.price,
            product_url: item.product_url,
            auto_scan_enabled: true,
            match_status: (item.confidence ?? 0) >= 95 ? 'automatic' : 'pending'
          });
          if (!res.success) {
            console.error(`[CompetitorService] Price Upsert Failed for ${item.name}:`, res.error);
            errors.push(`Price Save Error [${item.name}]: ${res.error}`);
          }
        }
      } else {
        unmatched++;
      }
    }
    return { saved, matched, unmatched, errorCount: errors.length, errors: errors.slice(0, 3) };
  }

  async getCatalogItems(status?: string): Promise<CatalogItem[]> {
    let query = supabase.from('competitor_catalog_items').select(`
      *,
      competitor:competitors (
        name
      ),
      product:products (
        name,
        brand,
        price
      )
    `).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return [];
    return (data || []).map((row: any) => {
      // Extremely flexible mapping
      const compRaw = row.competitor || row.competitors;
      const prodRaw = row.product || row.products;
      const comp = Array.isArray(compRaw) ? compRaw[0] : compRaw;
      const prod = Array.isArray(prodRaw) ? prodRaw[0] : prodRaw;

      return {
        id: row.id,
        competitor_id: row.competitor_id,
        matched_product_id: row.matched_product_id,
        name: row.name,
        price: row.price != null ? Number(row.price) : null,
        product_url: row.product_url,
        image_url: row.image_url,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        competitor_name: comp?.name || 'Unknown',
        matched_product_name: prod?.name || null,
        matched_brand: prod?.brand || null,
        matched_price: prod?.price != null ? Number(prod.price) : null,
        confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
        match_reasons: row.match_reasons || null,
        match_method: row.match_method || null,
        brand_match: row.brand_match || null,
        size_match: row.size_match || null,
        product_type_match: row.product_type_match || null,
        ai_used: row.ai_used || null,
        ai_model: row.ai_model || null,
        matched_at: row.matched_at || null,
      };
    });
  }

  async approveMatch(catalogItemId: string): Promise<boolean> {
    const { data: item } = await supabase.from('competitor_catalog_items').select('matched_product_id, price, product_url, competitor_id').eq('id', catalogItemId).maybeSingle();
    if (!item || !item.matched_product_id) return false;
    await supabase.from('competitor_catalog_items').update({ status: 'price_analysis', updated_at: new Date().toISOString() }).eq('id', catalogItemId);
    const res = await this.upsertPrice({ product_id: item.matched_product_id, competitor_id: item.competitor_id, price: item.price, product_url: item.product_url, auto_scan_enabled: true, match_status: 'manual' });
    return res.success;
  }

  async updateCatalogItemMatch(id: string, newProductId: string, competitorId: string): Promise<boolean> {
    await supabase.from('competitor_catalog_items').update({ matched_product_id: newProductId, status: 'price_analysis', updated_at: new Date().toISOString() }).eq('id', id);
    return await this.approveMatch(id);
  }

  async unmatchCatalogItem(id: string, competitorId: string): Promise<boolean> {
    const { data: item } = await supabase.from('competitor_catalog_items').select('matched_product_id').eq('id', id).maybeSingle();
    if (item?.matched_product_id) await supabase.from('competitor_prices').delete().eq('product_id', item.matched_product_id).eq('competitor_id', competitorId);
    const { error } = await supabase.from('competitor_catalog_items').update({ matched_product_id: null, status: 'purchase_opportunity', updated_at: new Date().toISOString() }).eq('id', id);
    return !error;
  }

  async deleteCatalogItem(id: string): Promise<boolean> {
    const { error } = await supabase.from('competitor_catalog_items').delete().eq('id', id);
    return !error;
  }

  async discoverCompetitor(competitorId: string): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      await supabase.from('competitors').update({ discovery_status: 'discovering' }).eq('id', competitorId);
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'discover', competitor_id: competitorId })
      });
      const result = await response.json();
      return { success: response.ok, message: result.message || 'Discovery complete', stats: result.stats };
    } catch (err: any) {
      await supabase.from('competitors').update({ discovery_status: 'failed' }).eq('id', competitorId);
      return { success: false, message: err.message };
    }
  }

  async triggerScan(): Promise<{ success: boolean; message: string }> {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` }, body: JSON.stringify({ action: 'scan' }) });
      const result = await response.json();
      return { success: response.ok, message: result.message || 'Scan complete' };
    } catch (err: any) { return { success: false, message: err.message }; }
  }

  async getPriceHistory(productId: string): Promise<any[]> {
    const { data } = await supabase.from('competitor_price_history').select('*').eq('product_id', productId).order('detected_at', { ascending: false }).limit(10);
    return data || [];
  }

  async lockPrice(productId: string, lockedPrice: number, storeId?: string, reason?: string, lockedBy?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('price_locks').upsert({
      product_id: productId,
      store_id: storeId || null,
      locked_price: lockedPrice,
      locked_by: lockedBy || 'admin',
      lock_reason: reason || null,
      is_active: true,
      locked_at: new Date().toISOString(),
    }, { onConflict: 'product_id,store_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async unlockPrice(productId: string, storeId?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('price_locks')
      .update({ is_active: false })
      .eq('product_id', productId)
      .eq('is_active', true);
    if (storeId) {
      await supabase.from('price_locks')
        .update({ is_active: false })
        .eq('product_id', productId)
        .eq('store_id', storeId)
        .eq('is_active', true);
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async getPriceLocks(): Promise<any[]> {
    const { data, error } = await supabase.from('price_locks')
      .select('*, product:products(name, brand)')
      .eq('is_active', true)
      .order('locked_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getPricingSettings(storeId?: string): Promise<any> {
    let query = supabase.from('pricing_settings').select('*');
    if (storeId) {
      query = query.or(`store_id.is.null,store_id.eq.${storeId}`);
    } else {
      query = query.is('store_id', null);
    }
    const { data, error } = await query.order('store_id', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (error) return null;
    return data;
  }

  async updatePricingSettings(settings: any, storeId?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('pricing_settings').upsert({
      ...settings,
      store_id: storeId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async getPriceChangeAudit(productId?: string, limit: number = 20): Promise<any[]> {
    let query = supabase.from('price_change_audit')
      .select('*, product:products(name, brand)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  }

  async getBasketComparison(productIds: string[]): Promise<any> {
      const prices = await this.getAllPrices();
      const competitors = await this.getAllCompetitors();

      const comparison: any = {
          our_total: 0,
          competitors: competitors.map(c => ({
              id: c.id,
              name: c.name,
              total: 0,
              missing_items: 0,
              delivery: 4.99 // Default assumption for basket analysis
          }))
      };

      for (const pid of productIds) {
          const { data: prod } = await supabase.from('products').select('price').eq('id', pid).single();
          if (prod) comparison.our_total += Number(prod.price);

          comparison.competitors.forEach((c: any) => {
              const compPrice = prices.find(p => p.product_id === pid && p.competitor_id === c.id && p.scan_status === 'success');
              if (compPrice) {
                  c.total += Number(compPrice.price);
              } else {
                  c.missing_items += 1;
                  // If missing, we assume market median or our price for the comparison to be fair
                  c.total += Number(prod?.price || 0);
              }
          });
      }

      return comparison;
  }
}

export const competitorService = new CompetitorService();
