import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function findDuplicates() {
  console.log("Fetching all products...");
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, gtin, created_at');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  if (!products || products.length === 0) {
    console.log("No products found.");
    return;
  }

  console.log(`Checking ${products.length} products for duplicates...\n`);

  const skuMap: Record<string, any[]> = {};
  const gtinMap: Record<string, any[]> = {};
  const nameMap: Record<string, any[]> = {};

  products.forEach(p => {
    if (p.sku) {
      if (!skuMap[p.sku]) skuMap[p.sku] = [];
      skuMap[p.sku].push(p);
    }
    if (p.gtin) {
      if (!gtinMap[p.gtin]) gtinMap[p.gtin] = [];
      gtinMap[p.gtin].push(p);
    }
    if (p.name) {
      const normalizedName = p.name.toLowerCase().trim();
      if (!nameMap[normalizedName]) nameMap[normalizedName] = [];
      nameMap[normalizedName].push(p);
    }
  });

  const duplicateSkus = Object.entries(skuMap).filter(([_, list]) => list.length > 1);
  const duplicateGtins = Object.entries(gtinMap).filter(([_, list]) => list.length > 1);
  const duplicateNames = Object.entries(nameMap).filter(([_, list]) => list.length > 1);

  if (duplicateSkus.length > 0) {
    console.log("--- Duplicate SKUs ---");
    duplicateSkus.forEach(([sku, list]) => {
      console.log(`SKU: ${sku} (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - ID: ${p.id}, Name: ${p.name}, Created: ${p.created_at}`));
    });
    console.log("");
  } else {
    console.log("No duplicate SKUs found.\n");
  }

  if (duplicateGtins.length > 0) {
    console.log("--- Duplicate GTINs ---");
    duplicateGtins.forEach(([gtin, list]) => {
      console.log(`GTIN: ${gtin} (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - ID: ${p.id}, Name: ${p.name}, Created: ${p.created_at}`));
    });
    console.log("");
  } else {
    console.log("No duplicate GTINs found.\n");
  }

  if (duplicateNames.length > 0) {
    console.log("--- Duplicate Names (Case-insensitive) ---");
    duplicateNames.forEach(([name, list]) => {
      console.log(`Name: "${name}" (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - ID: ${p.id}, SKU: ${p.sku}, GTIN: ${p.gtin}, Created: ${p.created_at}`));
    });
    console.log("");
  } else {
    console.log("No duplicate Names found.\n");
  }

  console.log("Check complete.");
}

findDuplicates();
