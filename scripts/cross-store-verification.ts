import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const chUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const chKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const malluUrl = process.env.MALLUSPICES_SUPABASE_URL;
const malluKey = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;

const pocketUrl = process.env.POCKET_SUPABASE_URL;
const pocketKey = process.env.POCKET_SUPABASE_SERVICE_ROLE_KEY;

const keralaUrl = process.env.SOURCE3_SUPABASE_URL || process.env.KERALA_SUPABASE_URL;
const keralaKey = process.env.SOURCE3_SUPABASE_SERVICE_ROLE_KEY || process.env.KERALA_SUPABASE_SERVICE_ROLE_KEY;

async function verify() {
  console.log("--- Comprehensive Cross-Store Data Verification ---\n");

  const chClient = createClient(chUrl, chKey);

  // 1. Fetch CentralHub Master Data
  console.log("Fetching CentralHub master data...");
  const { data: chProducts } = await chClient
    .from('products')
    .select('id, name, sku, price, brand, unit, stock, central_inventory(stock_quantity)')
    .is('is_deleted', false);

  if (!chProducts) {
    console.error("Failed to fetch CentralHub products.");
    return;
  }

  const chMap = new Map();
  chProducts.forEach(p => {
    const inv = Array.isArray(p.central_inventory) ? p.central_inventory[0] : p.central_inventory;
    chMap.set(p.id, {
      name: p.name,
      sku: p.sku,
      price: Number(p.price),
      brand: p.brand,
      unit: p.unit,
      stock: inv ? Number(inv.stock_quantity) : Number(p.stock || 0)
    });
  });

  console.log(`- Total CentralHub Active Products: ${chMap.size}\n`);

  // 2. Verify MalluSpices
  if (malluUrl && malluKey) {
    console.log("Verifying MalluSpices (centralhub_products_raw)...");
    const malluClient = createClient(malluUrl, malluKey);
    const { data: malluData } = await malluClient.from('centralhub_products_raw').select('centralhub_id, name, sku, price, stock, brand, unit');

    if (malluData) {
      let mismatches = 0;
      malluData.forEach(m => {
        const master = chMap.get(m.centralhub_id);
        if (!master) return; // Possibly a product not in our current "active" list or deleted locally but not remotely

        const diffs: string[] = [];
        if (m.name !== master.name) diffs.push(`name: "${m.name}" vs "${master.name}"`);
        if (m.sku !== master.sku) diffs.push(`sku: "${m.sku}" vs "${master.sku}"`);
        if (Math.abs(Number(m.price) - master.price) > 0.01) diffs.push(`price: ${m.price} vs ${master.price}`);
        if (Number(m.stock) !== master.stock) diffs.push(`stock: ${m.stock} vs ${master.stock}`);

        if (diffs.length > 0) {
          mismatches++;
          console.log(`[MISMATCH] Mallu ID ${m.centralhub_id} (${master.sku}): ${diffs.join(', ')}`);
        }
      });
      console.log(`- MalluSpices Mismatches: ${mismatches} / ${malluData.length} checked`);
    } else {
      console.log("- MalluSpices data could not be fetched.");
    }
  }

  // 3. Verify PocketGrocery
  if (pocketUrl && pocketKey) {
    console.log("\nVerifying PocketGrocery (products)...");
    const pocketClient = createClient(pocketUrl, pocketKey);
    const { data: pocketData } = await pocketClient.from('products').select('id, name, sku, price, stock_quantity, brand_id');

    if (pocketData) {
      let mismatches = 0;
      pocketData.forEach(p => {
        const master = chMap.get(p.id);
        if (!master) return;

        const diffs: string[] = [];
        if (p.name !== master.name) diffs.push(`name: "${p.name}" vs "${master.name}"`);
        if (p.sku !== master.sku) diffs.push(`sku: "${p.sku}" vs "${master.sku}"`);
        if (Math.abs(Number(p.price) - master.price) > 0.01) diffs.push(`price: ${p.price} vs ${master.price}`);
        if (Number(p.stock_quantity) !== master.stock) diffs.push(`stock: ${p.stock_quantity} vs ${master.stock}`);

        if (diffs.length > 0) {
          mismatches++;
          if (mismatches <= 5) console.log(`[MISMATCH] Pocket ID ${p.id} (${master.sku}): ${diffs.join(', ')}`);
        }
      });
      if (mismatches > 5) console.log(`... and ${mismatches - 5} more mismatches in PocketGrocery.`);
      console.log(`- PocketGrocery Mismatches: ${mismatches} / ${pocketData.length} checked`);
    }
  }

  // 4. Verify KeralaGrocery
  if (keralaUrl && keralaKey) {
    console.log("\nVerifying KeralaGrocery (products)...");
    const keralaClient = createClient(keralaUrl, keralaKey);
    const { data: keralaData } = await keralaClient.from('products').select('id, name, sku, price, stock_quantity');

    if (keralaData) {
      let mismatches = 0;
      keralaData.forEach(p => {
        const master = chMap.get(p.id);
        if (!master) return;

        const diffs: string[] = [];
        if (p.name !== master.name) diffs.push(`name: "${p.name}" vs "${master.name}"`);
        if (p.sku !== master.sku) diffs.push(`sku: "${p.sku}" vs "${master.sku}"`);
        if (Math.abs(Number(p.price) - master.price) > 0.01) diffs.push(`price: ${p.price} vs ${master.price}`);
        if (Number(p.stock_quantity) !== master.stock) diffs.push(`stock: ${p.stock_quantity} vs ${master.stock}`);

        if (diffs.length > 0) {
          mismatches++;
          if (mismatches <= 5) console.log(`[MISMATCH] Kerala ID ${p.id} (${master.sku}): ${diffs.join(', ')}`);
        }
      });
      if (mismatches > 5) console.log(`... and ${mismatches - 5} more mismatches in KeralaGrocery.`);
      console.log(`- KeralaGrocery Mismatches: ${mismatches} / ${keralaData.length} checked`);
    }
  }

  console.log("\n--- Verification Complete ---");
}

verify().catch(console.error);
