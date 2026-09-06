import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("=== SEEDING PROMOTION SIMULATOR TEST DATA ===");

  const products = [
    // 1. Healthy-margin, Healthy-stock (Safe)
    { id: 'fe450af8-041b-418b-94ef-ddaf6cd2c615', name: 'Velvet Touch Soap', cost: 0.65, price: 1.49, stock: 100, velocity: 2, min_margin: 8 },
    // 2. Low-margin (Risk)
    { id: '1c5db6ed-9e53-455b-bcd4-08bfa74d83e6', name: 'Care Soap', cost: 1.10, price: 1.29, stock: 50, velocity: 1, min_margin: 15 },
    // 3. Low-stock (Do not promote)
    { id: '1541f09f-0c06-4f7d-a434-0a1990e15590', name: 'Fabric Conditioner', cost: 3.00, price: 4.99, stock: 5, velocity: 3, min_margin: 8 },
    // 4. Competitor match
    { id: '462dd440-fad9-490f-b981-e8611a4b84f1', name: 'Cut Mango Pickle', cost: 1.80, price: 2.99, stock: 80, velocity: 4, min_margin: 10 },
    // 5. High-stock
    { id: 'cc4d7f26-3f0d-41ef-a6a2-1fc6845cb418', name: 'Lime Pickle', cost: 1.20, price: 1.99, stock: 500, velocity: 5, min_margin: 8 }
  ];

  for (const p of products) {
    console.log(`Updating ${p.name}...`);

    await supabase.from('products').update({
      cost_price: p.cost,
      price: p.price,
      min_margin: p.min_margin,
      is_active: true,
      is_deleted: false
    }).eq('id', p.id);

    await supabase.from('central_inventory').upsert({
      product_id: p.id,
      stock_quantity: p.stock
    }, { onConflict: 'product_id' });

    await supabase.from('inventory_forecasts').upsert({
      product_id: p.id,
      sales_velocity_30d: p.velocity
    }, { onConflict: 'product_id' });
  }

  console.log("Seed complete.");
}

run();
