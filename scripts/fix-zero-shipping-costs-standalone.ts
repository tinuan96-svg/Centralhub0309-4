import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Redefine logic here to avoid import issues
function analyzePostcode(postcode: string) {
  const cleanPostcode = (postcode || '').replace(/\s+/g, '').toUpperCase();
  const area = cleanPostcode.match(/^[A-Z]{1,2}/)?.[0] || '';
  const districtMatch = cleanPostcode.match(/^[A-Z]{1,2}(\d{1,2})/);
  const district = districtMatch ? parseInt(districtMatch[1]) : 0;
  let zone: any = 'A';
  let isIsleOfWight = false;
  if (area === 'BT') zone = 'C';
  else if (['IM', 'GY', 'JE'].includes(area)) zone = 'D';
  else if (area === 'PO' && district >= 30 && district <= 41) isIsleOfWight = true;
  return { zone, isIsleOfWight };
}

function calculateCost(weightKg: number, zone: string, isIOW: boolean) {
  // Simple version of the logic matching the contract
  const baseRates: any = { A: 4.82, B: 4.82, C: 10.85, D: 13.56 };
  let cost = baseRates[zone] || 4.82;
  if (weightKg > 30) {
    cost += (weightKg - 30) * 0.40;
    if (weightKg <= 32) cost += 10;
    else if (weightKg <= 34) cost += 15;
    else if (weightKg <= 36) cost += 30;
    else cost += 40;
  }
  if (isIOW) cost += 5.43;
  return cost * 1.12; // 12% Fuel
}

async function run() {
  console.log('--- 🚀 EMERGENCY SHIPPING COST FIX ---');
  const { data: shipments } = await supabase.from('shipments').select('*').or('shipping_cost.eq.0,shipping_cost.is.null');
  if (!shipments || shipments.length === 0) { console.log('No shipments to fix.'); return; }

  for (const s of shipments) {
    const analysis = analyzePostcode(s.recipient_postcode);
    const weight = (s.weight_grams || 1000) / 1000;
    const finalCost = calculateCost(weight, analysis.zone, analysis.isIsleOfWight);
    const pence = Math.round(finalCost * 100);

    await supabase.from('shipments').update({ shipping_cost: pence }).eq('id', s.id);
    console.log(`Updated ${s.shipment_number}: £${finalCost.toFixed(2)}`);
  }
  console.log('--- 🏁 DONE ---');
}

run();
