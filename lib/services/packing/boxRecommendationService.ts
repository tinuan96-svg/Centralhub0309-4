import { supabase } from '../../supabase';
import { PackingMaterial } from '../packingMaterialService';

export interface BoxRecommendation {
  box: PackingMaterial;
  utilization: number;
  isFit: boolean;
}

export class BoxRecommendationService {
  /**
   * Recommends the smallest box that fits all items in the order
   */
  static async recommendBox(orderId: string): Promise<BoxRecommendation | null> {
    try {
      // 1. Get order items with dimensions
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity, products(length_cm, width_cm, height_cm, weight_kg)')
        .eq('order_id', orderId);

      if (!items || items.length === 0) return null;

      let totalVolume = 0;
      let totalWeight = 0;
      let maxL = 0, maxW = 0, maxH = 0;

      items.forEach((item: any) => {
        const p = item.products;
        if (!p) return;

        const l = Number(p.length_cm) || 10;
        const w = Number(p.width_cm) || 10;
        const h = Number(p.height_cm) || 10;
        const qty = Number(item.quantity) || 1;

        totalVolume += (l * w * h) * qty;
        totalWeight += (Number(p.weight_kg) || 0.1) * qty;

        // Items can be rotated, so we just track the longest side of any single item
        maxL = Math.max(maxL, l);
        maxW = Math.max(maxW, w);
        maxH = Math.max(maxH, h);
      });

      // 2. Get available boxes
      const { data: boxes } = await supabase
        .from('packing_materials')
        .select('*')
        .eq('category', 'box')
        .eq('is_active', true)
        .order('volume_cm3', { ascending: true });

      if (!boxes || boxes.length === 0) return null;

      // 3. Find first box that fits
      // Simplified fitting: Box volume > Total item volume * 1.2 (for padding)
      // AND Box dimensions > max item dimensions
      for (const box of boxes) {
        const paddingMultiplier = 1.2;
        const fitsVolume = (box.volume_cm3 || 0) >= (totalVolume * paddingMultiplier);

        // Dimension check (allows rotation: we sort box dims and item max dims)
        const boxDims = [box.internal_length || 0, box.internal_width || 0, box.internal_height || 0].sort((a, b) => b - a);
        const itemMaxDims = [maxL, maxW, maxH].sort((a, b) => b - a);

        const fitsDimensions = boxDims[0] >= itemMaxDims[0] &&
                               boxDims[1] >= itemMaxDims[1] &&
                               boxDims[2] >= itemMaxDims[2];

        if (fitsVolume && fitsDimensions) {
          return {
            box: box as PackingMaterial,
            utilization: Math.round((totalVolume / (box.volume_cm3 || 1)) * 100),
            isFit: true
          };
        }
      }

      // If no box fits perfectly, return the largest box
      return {
        box: boxes[boxes.length - 1] as PackingMaterial,
        utilization: 100,
        isFit: false
      };

    } catch (err) {
      console.error('[BoxRecommendation] Error:', err);
      return null;
    }
  }
}
