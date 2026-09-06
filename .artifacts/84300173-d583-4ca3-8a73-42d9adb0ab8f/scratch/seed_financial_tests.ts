import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const COMPETITOR_ID = 'a59bbee7-fd89-44b5-9fdd-5c8ce4530452'; // KeralaTaste

async function run() {
  console.log("=== SEEDING FINANCIAL VALIDATION DATA ===");

  const products = [
    { id: '462dd440-fad9-490f-b981-e8611a4b84f1', name: 'Cut Mango Pickle', cost: 1.80, price: 2.99, comp_price: 2.79 },
    { id: 'a7cd6d6c-b634-4818-a58e-788c177bc1a0', name: 'Garlic Pickle', cost: 2.10, price: 3.49, comp_price: 3.29 },
    { id: 'cc4d7f26-3f0d-41ef-a6a2-1fc6845cb418', name: 'Lime Pickle', cost: 1.20, price: 1.99, comp_price: 2.19 },
    { id: 'fe450af8-041b-418b-94ef-ddaf6cd2c615', name: 'Velvet Touch Soap', cost: 0.65, price: 1.49, comp_price: 1.39 },
    { id: '1c5db6ed-9e53-455b-bcd4-08bfa74d83e6', name: 'Care Soap', cost: 0.55, price: 1.29, comp_price: 1.09 }
  ];

  for (const p of products) {
    console.log(`Processing ${p.name}...`);

    // Update master product
    await supabase.from('products').update({
      cost_price: p.cost,
      price: p.price,
      is_active: true,
      is_deleted: false,
      min_margin: 10
    }).eq('id', p.id);

    // Delete existing to bypass upsert issues
    await supabase.from('competitor_prices').delete().eq('product_id', p.id).eq('competitor_id', COMPETITOR_ID);

    // Insert verified competitor price
    const { error } = await supabase.from('competitor_prices').insert({
      product_id: p.id,
      competitor_id: COMPETITOR_ID,
      price: p.comp_price,
      match_status: 'automatic',
      brand_match: true,
      size_match: true,
      product_type_match: true,
      scan_status: 'success',
      last_scanned_at: new Date().toISOString(),
      match_confidence: 98,
      match_method: 'deterministic'
    });

    if (error) console.error("Insert Error:", error);
  }

  console.log("Seed complete.");
}

run();
