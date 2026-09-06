import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const SQL_FILE_PATH = "C:/Users/sruth/Downloads/products_rows (3).sql";

const COL = {
  id: 0,
  name: 1,
  slug: 2,
  description: 3,
  price: 4,
  sale_price: 5,
  images: 6,
  category_id: 7,
  brand: 8,
  tags: 9,
  in_stock: 10,
  weight: 11,
  unit: 12,
  rating: 13,
  review_count: 14,
  is_featured: 15,
  created_at: 16,
  cost_price: 17,
  stock_quantity: 18,
  warehouse_location: 19,
  expiry_date: 20,
  sku: 21,
  is_published: 22,
  product_type: 23,
  short_description: 24,
  compare_at_price: 25,
  gtin: 26,
  seo_title: 27,
  seo_description: 28,
  woocommerce_id: 29,
  parent_sku: 30,
  barcode: 36,
  barcode_type: 37,
  updated_at: 38,
  brand_id: 39,
  seo_keywords: 40,
  variant_group_id: 41,
  variant_type: 42,
  variant_value: 43,
  measurement_type: 44,
  measurement_value: 45,
  measurement_unit: 46,
  is_archived: 47
};

async function syncStockToRemote(productId: string, availableStock: number) {
  const remotes = [
    { url: process.env.MALLUSPICES_SUPABASE_URL, key: process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY },
    { url: process.env.POCKET_SUPABASE_URL, key: process.env.POCKET_SUPABASE_SERVICE_ROLE_KEY },
    { url: process.env.SOURCE3_SUPABASE_URL, key: process.env.SOURCE3_SUPABASE_SERVICE_ROLE_KEY },
  ].filter(r => r.url && r.key);

  if (remotes.length === 0) return;

  const pushPromises = remotes.map(async (remote) => {
    try {
      const remoteClient = createClient(remote.url!, remote.key!);
      await remoteClient
        .from("products")
        .update({ stock: availableStock })
        .eq("id", productId);
    } catch (error) {
      console.error(`Failed to sync stock to remote ${remote.url}:`, error);
    }
  });

  await Promise.all(pushPromises);
}

async function parseSqlRows(content: string) {
  const products: any[] = [];
  const inventory: any[] = [];

  // Find the start of VALUES
  const valuesIndex = content.indexOf("VALUES");
  if (valuesIndex === -1) return { products, inventory };

  let remaining = content.substring(valuesIndex + 6).trim();
  // Remove trailing semicolon if exists
  if (remaining.endsWith(";")) {
    remaining = remaining.substring(0, remaining.length - 1);
  }

  let i = 0;
  while (i < remaining.length) {
    // Expecting '(' to start a row
    while (i < remaining.length && remaining[i] !== '(') i++;
    if (i >= remaining.length) break;
    i++; // Skip '('

    const values: string[] = [];
    let current = "";
    let inString = false;
    let inArray = false;
    let parenDepth = 0;

    while (i < remaining.length) {
      const char = remaining[i];
      const nextChar = remaining[i + 1];

      if (inString) {
        if (char === "'" && nextChar === "'") {
          current += "''";
          i += 2;
          continue;
        } else if (char === "'") {
          inString = false;
          current += char;
        } else {
          current += char;
        }
      } else {
        if (char === "'") {
          inString = true;
          current += char;
        } else if (char === "[") {
          inArray = true;
          current += char;
        } else if (char === "]") {
          inArray = false;
          current += char;
        } else if (char === "(") {
          parenDepth++;
          current += char;
        } else if (char === ")") {
          if (parenDepth > 0) {
            parenDepth--;
            current += char;
          } else {
            // End of row
            values.push(current.trim());
            i++;
            break;
          }
        } else if (char === "," && !inArray && parenDepth === 0) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      i++;
    }

    const cleanValues = values.map(v => {
      if (!v || v.toUpperCase() === "NULL") return null;
      if (v.startsWith("'") && v.endsWith("'")) {
        return v.substring(1, v.length - 1).replace(/''/g, "'");
      }
      if (v.startsWith("ARRAY[")) {
        const arrContent = v.substring(6, v.length - 1).trim();
        if (!arrContent) return [];

        const items: string[] = [];
        let currentItem = "";
        let inItemString = false;
        for (let j = 0; j < arrContent.length; j++) {
          const c = arrContent[j];
          if (inItemString) {
            if (c === "'" && arrContent[j+1] === "'") {
              currentItem += "'";
              j++;
            } else if (c === "'") {
              inItemString = false;
            } else {
              currentItem += c;
            }
          } else {
            if (c === "'") {
              inItemString = true;
            } else if (c === ",") {
              items.push(currentItem.trim());
              currentItem = "";
            } else {
              currentItem += c;
            }
          }
        }
        items.push(currentItem.trim());
        return items.filter(item => item !== "");
      }
      return v;
    });

    const id = cleanValues[COL.id] as string;
    if (id) {
      const images = cleanValues[COL.images] as string[] || [];

      products.push({
        id: id,
        name: cleanValues[COL.name] as string,
        slug: cleanValues[COL.slug] as string,
        description: cleanValues[COL.description] as string,
        short_description: cleanValues[COL.short_description] as string,
        price: parseFloat((cleanValues[COL.price] as string) || "0"),
        sale_price: cleanValues[COL.sale_price] ? parseFloat(cleanValues[COL.sale_price] as string) : null,
        compare_at_price: cleanValues[COL.compare_at_price] ? parseFloat(cleanValues[COL.compare_at_price] as string) : null,
        cost_price: cleanValues[COL.cost_price] ? parseFloat(cleanValues[COL.cost_price] as string) : null,
        brand: cleanValues[COL.brand] as string,
        brand_id: cleanValues[COL.brand_id] as string,
        gtin: cleanValues[COL.gtin] as string,
        barcode: cleanValues[COL.barcode] as string,
        barcode_type: cleanValues[COL.barcode_type] as string,
        warehouse_location: cleanValues[COL.warehouse_location] as string,
        image_url: images[0] || null,
        gallery_images: images,
        sku: cleanValues[COL.sku] as string,
        is_active: true,
        is_published: (cleanValues[COL.is_published] as any) === "true" || (cleanValues[COL.is_published] as any) === true,
        is_featured: (cleanValues[COL.is_featured] as any) === "true" || (cleanValues[COL.is_featured] as any) === true,
        is_archived: (cleanValues[COL.is_archived] as any) === "true" || (cleanValues[COL.is_archived] as any) === true,
        tags: cleanValues[COL.tags] || [],
        weight: cleanValues[COL.weight] as string,
        unit: cleanValues[COL.unit] as string,
        rating: parseFloat((cleanValues[COL.rating] as string) || "0"),
        review_count: parseInt((cleanValues[COL.review_count] as string) || "0"),
        expiry_date: cleanValues[COL.expiry_date],
        product_type: cleanValues[COL.product_type] as string || 'simple',
        seo_title: cleanValues[COL.seo_title] as string,
        seo_description: cleanValues[COL.seo_description] as string,
        seo_keywords: cleanValues[COL.seo_keywords] as string,
        woocommerce_id: cleanValues[COL.woocommerce_id] as string,
        parent_sku: cleanValues[COL.parent_sku] as string,
        variant_group_id: cleanValues[COL.variant_group_id] as string,
        variant_type: cleanValues[COL.variant_type] as string,
        variant_value: cleanValues[COL.variant_value] as string,
        measurement_type: cleanValues[COL.measurement_type] as string,
        measurement_value: cleanValues[COL.measurement_value] as string,
        measurement_unit: cleanValues[COL.measurement_unit] as string,
        category_id: cleanValues[COL.category_id] as string
      });

      inventory.push({
        product_id: id,
        stock_quantity: parseInt((cleanValues[COL.stock_quantity] as string) || "0"),
        low_stock_threshold: 10
      });
    }

    // Skip to next row (skip ',' and whitespace)
    while (i < remaining.length && (remaining[i] === "," || remaining[i] === " " || remaining[i] === "\n" || remaining[i] === "\r")) i++;
  }

  return { products, inventory };
}

async function sync() {
  console.log("Starting sync from MalluSpices SQL file...");

  if (!fs.existsSync(SQL_FILE_PATH)) {
    console.error("SQL file not found at path:", SQL_FILE_PATH);
    return;
  }

  const content = fs.readFileSync(SQL_FILE_PATH, "utf8");
  const { products, inventory } = await parseSqlRows(content);

  console.log(`Parsed ${products.length} products. Proceeding to upsert...`);

  const results = {
    newProducts: 0,
    updatedProducts: 0,
    stockAdjustments: 0,
    errors: [] as string[]
  };

  // Ensure categories exist to prevent FK violations
  const categoryIds = Array.from(new Set(products.map(p => p.category_id).filter(Boolean)));
  console.log(`Ensuring ${categoryIds.length} categories exist...`);
  for (const cid of categoryIds) {
    const { error: catError } = await supabase
      .from('categories')
      .upsert({ id: cid, name: `Category ${cid}`, slug: `cat-${cid}` }, { onConflict: 'id' });
    if (catError && catError.code !== '23505') {
       console.warn(`Warning: Could not ensure category ${cid}:`, catError.message);
    }
  }

  const CHUNK_SIZE = 50;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);

    // Check which ones are new
    const ids = chunk.map(p => p.id);
    const { data: existingProducts } = await supabase.from("products").select("id").in("id", ids);
    const existingIds = new Set(existingProducts?.map(p => p.id) || []);

    chunk.forEach(p => {
      if (existingIds.has(p.id)) results.updatedProducts++;
      else results.newProducts++;
    });

    const { error: pError } = await supabase.from("products").upsert(chunk, { onConflict: 'id' });
    if (pError) {
      console.error("Error upserting products chunk:", pError);
      results.errors.push(`Products chunk error: ${pError.message}`);
    } else {
      console.log(`Upserted products chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
    }
  }

  for (let i = 0; i < inventory.length; i += CHUNK_SIZE) {
    const chunk = inventory.slice(i, i + CHUNK_SIZE);

    for (const inv of chunk) {
       const { data: existing } = await supabase.from("central_inventory")
         .select("stock_quantity")
         .eq("product_id", inv.product_id)
         .maybeSingle();

       let finalStock = inv.stock_quantity;
       let shouldSyncRemote = false;

       if (existing) {
          if (existing.stock_quantity !== inv.stock_quantity) {
             const diff = inv.stock_quantity - existing.stock_quantity;
             await supabase.from("central_inventory").update({ stock_quantity: inv.stock_quantity }).eq("product_id", inv.product_id);

             await supabase.from("inventory_logs").insert({
                product_id: inv.product_id,
                change: diff,
                old_quantity: existing.stock_quantity,
                new_quantity: inv.stock_quantity,
                type: 'ADJUSTMENT',
                reason: 'MalluSpices Data Sync',
                notes: 'Stock updated from MalluSpices master database SQL export',
                device_name: 'MalluSpices Sync Script'
             });
             results.stockAdjustments++;
             shouldSyncRemote = true;
          }
       } else {
          await supabase.from("central_inventory").insert(inv);
          await supabase.from("inventory_logs").insert({
             product_id: inv.product_id,
             change: inv.stock_quantity,
             old_quantity: 0,
             new_quantity: inv.stock_quantity,
             type: 'MANUAL',
             reason: 'Initial Sync',
             notes: 'Initial inventory from MalluSpices master database',
             device_name: 'MalluSpices Sync Script'
          });
          results.stockAdjustments++;
          shouldSyncRemote = true;
       }

       if (shouldSyncRemote) {
         await syncStockToRemote(inv.product_id, finalStock);
       }
    }
    console.log(`Processed inventory chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
  }

  console.log("\n--- Sync Report ---");
  console.log(`New Products: ${results.newProducts}`);
  console.log(`Updated Products: ${results.updatedProducts}`);
  console.log(`Stock Adjustments: ${results.stockAdjustments}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
    results.errors.forEach(e => console.error(` - ${e}`));
  }
  console.log("-------------------\n");
  console.log("Sync complete!");
}

sync().catch(console.error);
