import { createClient } from '@supabase/supabase-js';
import { analyzePostcode, isLondonCongestionZone } from '../lib/utils/postcodeUtils.ts';
import { DHLRateCalculatorService } from '../lib/services/shipping/dhlRateCalculatorService.ts';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCosts() {
  console.log('--- 🚀 FIXING ZERO SHIPPING COSTS ---');

  const { data: shipments, error: shipError } = await supabase
    .from('shipments')
    .select('*, orders(order_number)')
    .or('shipping_cost.eq.0,shipping_cost.is.null');

  if (shipError) {
    console.error('Error fetching shipments:', shipError);
    return;
  }

  if (!shipments || shipments.length === 0) {
    console.log('✅ No shipments with £0.00 cost found.');
    return;
  }

  console.log(`Found ${shipments.length} shipments to update.`);

  for (const shipment of shipments) {
    try {
      console.log(`\nProcessing ${shipment.shipment_number} (Order: ${shipment.orders?.order_number || 'N/A'})...`);

      const postcode = shipment.recipient_postcode;
      if (!postcode) {
        console.warn(`- Skipping: No postcode found for shipment ${shipment.id}`);
        continue;
      }

      const analysis = analyzePostcode(postcode);
      const isCongestion = isLondonCongestionZone(postcode);

      // Try to get dimensions from order items
      let dimensions = { length: 30, width: 30, height: 30 };
      if (shipment.order_id) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', shipment.order_id);

        if (items && items.length > 0) {
          const productIds = items.map(i => i.product_id).filter(Boolean);
          const { data: products } = await supabase
            .from('products')
            .select('id, length_cm, width_cm, height_cm')
            .in('id', productIds);

          if (products && products.length > 0) {
            let totalVol = 0;
            items.forEach(item => {
              const p = products.find(prod => prod.id === item.product_id);
              if (p) {
                totalVol += ((p.length_cm || 10) * (p.width_cm || 10) * (p.height_cm || 10)) * (item.quantity || 1);
              }
            });
            const side = Math.max(Math.pow(totalVol, 1/3), 20);
            dimensions = { length: Math.round(side), width: Math.round(side), height: Math.round(side) };
          }
        }
      }

      const calc = DHLRateCalculatorService.calculateLegacy({
        shipmentDate: new Date(shipment.created_at),
        zone: analysis.zone,
        numParcels: 1,
        weightPerParcel: (shipment.weight_grams || 1000) / 1000,
        dimensions,
        timedService: 'none',
        isIsleOfWight: analysis.isIsleOfWight,
        isCongestionZone: isCongestion,
      });

      const newCost = Math.round(calc.totalEstimatedCost * 100);

      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          shipping_cost: newCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', shipment.id);

      if (updateError) {
        console.error(`- Failed to update: ${updateError.message}`);
      } else {
        console.log(`- ✅ Success: £${(newCost / 100).toFixed(2)} (Zone ${analysis.zone})`);
      }
    } catch (err) {
      console.error(`- Error: ${err}`);
    }
  }

  console.log('\n--- 🏁 DATA FIX COMPLETE ---');
}

fixCosts();
