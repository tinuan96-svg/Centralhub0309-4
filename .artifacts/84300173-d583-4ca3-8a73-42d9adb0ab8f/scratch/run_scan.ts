import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function run() {
  console.log("=== RUNNING REAL COMPETITOR SCAN (SINGLE) ===");
  const url = "https://www.pickeasy.co.uk/product-page/steam-puttupodi-by-ajmi";

  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/competitor-price-scanner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      action: 'match_catalog_products',
      products: [{ name: "Velvet Touch Soap 1pc by Lux", brand: "Lux", price: 0.99 }]
    })
  });

  if (!response.ok) {
    console.error("Scan failed:", await response.text());
    return;
  }

  const result = await response.json();
  if (!result.success) {
    console.error("Action failed:", result.error);
    return;
  }

  const p = result.products[0];
  console.log("MATCHING RESULT:");
  console.log("Input:", "Velvet Touch Soap by Lux");
  console.log("Matched Product ID:", p.matched_product_id);
  console.log("Confidence:", p.confidence);
  console.log("Method:", p.match_method);
  console.log("Reasons:", p.match_reasons?.join(', '));

  if (p.matched_product_id) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!);
      const { data: ourProd } = await supabase.from("products").select("name, brand, weight, unit").eq("id", p.matched_product_id).single();
      console.log("Matched with Catalog:", ourProd?.name, `[${ourProd?.brand}]`, `${ourProd?.weight}${ourProd?.unit}`);
  }
}

run();
