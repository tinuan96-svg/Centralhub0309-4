import { supabase } from '@/lib/supabase';
import { campaignService } from './campaignService';
import { competitorService } from '../competitorService';
import { purchasingService } from '../purchasing/purchasingService';

export const approvalService = {
  /**
   * Transition recommendation to UNDER REVIEW
   */
  async startReview(id: string) {
    const { error } = await supabase
      .from('intelligence_recommendations')
      .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * REJECT a recommendation
   */
  async rejectRecommendation(id: string, reason?: string) {
    const { error } = await supabase
      .from('intelligence_recommendations')
      .update({ status: 'rejected', metadata: { rejection_reason: reason } })
      .eq('id', id);
    if (error) throw error;

    // Log the rejection
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('intelligence_audit_log').insert({
      recommendation_id: id,
      user_id: user?.id,
      action: 'reject',
      status: 'success',
      previous_value: { reason }
    });
  },

  /**
   * APPROVE and EXECUTE a recommendation using existing services
   */
  async approveAndExecute(id: string) {
    // 1. Fetch recommendation details
    const { data: rec, error: fetchError } = await supabase
      .from('intelligence_recommendations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !rec) throw new Error('Recommendation not found');
    if (rec.status === 'executed') throw new Error('Already executed');

    // 2. STALE DATA PROTECTION (Phase 16)
    if (rec.entity_type === 'product' && rec.entity_id) {
      const { data: product } = await supabase.from('products').select('price, cost_price, updated_at, central_inventory(stock_quantity)').eq('id', rec.entity_id).single();

      if (!product) {
        await supabase.from('intelligence_recommendations').update({ is_stale: true, status: 'stale' }).eq('id', id);
        throw new Error('STALE: Product no longer exists');
      }

      // Snapshot Comparison
      const snapshot = rec.source_snapshot || {};
      const currentStock = (product as any).central_inventory?.[0]?.stock_quantity;

      const priceChanged = snapshot.price !== undefined && product.price !== snapshot.price;
      const costChanged = snapshot.cost !== undefined && product.cost_price !== snapshot.cost;
      const stockChanged = snapshot.stock !== undefined && Math.abs(currentStock - snapshot.stock) > (snapshot.stock * 0.05); // Tightened to 5% variance for Phase 3C

      if (priceChanged || costChanged || stockChanged) {
        await supabase.from('intelligence_recommendations').update({ is_stale: true, status: 'stale' }).eq('id', id);
        throw new Error(`STALE: Critical data changed since generation (Price: ${priceChanged}, Cost: ${costChanged}, Stock: ${stockChanged})`);
      }
    }

    // 3. EXECUTION via Existing Services
    let executionResult = null;
    const { data: { user } } = await supabase.auth.getUser();

    try {
      if (rec.recommendation_type === 'inventory_reorder') {
        const items = rec.metadata?.items;
        const supplier_id = rec.metadata?.supplier_id;

        if (!supplier_id || !items || !Array.isArray(items)) {
           throw new Error('Invalid reorder metadata: Missing supplier_id or items array');
        }

        executionResult = await purchasingService.createDraftPO({
          supplier_id: supplier_id,
          store_id: rec.store_id,
          items: items,
          trigger_reason: rec.title
        });
      }
      else if (rec.recommendation_type === 'pricing_opportunity') {
        const newPrice = rec.metadata?.proposed_price;
        if (!newPrice || !rec.entity_id) throw new Error('Missing pricing metadata');
        const success = await competitorService.updateProductPrice(rec.entity_id, newPrice);
        if (!success) throw new Error('Failed to update product price via CompetitorService');
        executionResult = { new_price: newPrice };
      }
      else if (rec.recommendation_type === 'promotion') {
        const newPrice = rec.metadata?.simulation_params?.promotional_price || rec.metadata?.proposed_price;
        if (!newPrice || !rec.entity_id) throw new Error('Missing promotion metadata');
        const success = await competitorService.updateProductPrice(rec.entity_id, newPrice);
        if (!success) throw new Error('Failed to update promotional price');
        executionResult = { promotional_price: newPrice, duration: rec.metadata?.simulation_params?.duration_days };
      }
      // ... Add other types (Campaign, Recovery) as they are built out

      // 4. Update Status to EXECUTED
      await supabase
        .from('intelligence_recommendations')
        .update({
          status: 'executed',
          actioned_at: new Date().toISOString(),
          is_stale: false // Ensure it's not marked stale if we just executed it
        })
        .eq('id', id);

      // 5. AUDIT LOG
      await supabase.from('intelligence_audit_log').insert({
        recommendation_id: id,
        user_id: user?.id,
        action: 'execute',
        status: 'success',
        result_value: { executionResult },
        entity_type: rec.entity_type,
        entity_id: rec.entity_id,
        store_id: rec.store_id
      });

      return executionResult;

    } catch (err: any) {
      // Log Failure
      await supabase.from('intelligence_audit_log').insert({
        recommendation_id: id,
        user_id: user?.id,
        action: 'execute',
        status: 'failed',
        error_message: err.message
      });
      throw err;
    }
  }
};
