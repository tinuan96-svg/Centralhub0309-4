import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function callMatch(products: any[]) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/competitor-price-scanner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ action: 'match_catalog_products', products })
  });
  return await response.json();
}

async function run() {
  console.log("=== FINAL LIVE MATCHING VALIDATION ===");

  // 1. LIVE EXACT MATCH TEST
  console.log("\n--- 1. LIVE EXACT MATCH TEST ---");
  const exactProducts = [
    { name: "Cut Mango Pickle 400g by Nirapara", brand: "Nirapara", price: 2.99 },
    { name: "Double Horse Garlic Pickle 400g", brand: "Double Horse", price: 3.49 },
    { name: "Tasty Nibbles Lime Pickle 400g", brand: "Tasty Nibbles", price: 1.99 }
  ];
  const exactRes = await callMatch(exactProducts);
  exactRes.products.forEach((p: any, i: number) => {
    console.log(`Test 1.${i+1}: ${p.name} -> ${p.matched_product_id ? 'MATCH (' + p.confidence + '%)' : 'NO_MATCH'}`);
    console.log(`  Method: ${p.match_method}, Reasons: ${p.match_reasons?.join(', ')}`);
  });

  // 2. LIVE WRONG-PRODUCT TEST
  console.log("\n--- 2. LIVE WRONG-PRODUCT TEST ---");
  const wrongProducts = [
    { name: "Nirapara Mango Pickle 400g", brand: "Nirapara", price: 2.99 }, // vs Cut Mango Pickle
    { name: "Tasty Nibbles Fish Pickle 400g", brand: "Tasty Nibbles", price: 4.99 }, // vs Prawns Pickle (if exists) or Lime Pickle
    { name: "Aachi Chicken 65 Masala 200g", brand: "Aachi", price: 1.50 } // vs Ajmi Chicken Masala
  ];
  const wrongRes = await callMatch(wrongProducts);
  wrongRes.products.forEach((p: any, i: number) => {
    console.log(`Test 2.${i+1}: ${p.name} -> ${p.matched_product_id ? 'MATCH (' + p.confidence + '%)' : 'NO_MATCH'}`);
    console.log(`  Method: ${p.match_method}, Reasons: ${p.match_reasons?.join(', ')}`);
  });

  // 3. SIZE TEST
  console.log("\n--- 3. SIZE TEST ---");
  const sizeProducts = [
    { name: "Double Horse Garlic Pickle 200g", brand: "Double Horse", price: 1.99 }, // vs 400g
    { name: "Double Horse Garlic Pickle 500g", brand: "Double Horse", price: 3.99 },
    { name: "Double Horse Garlic Pickle 1kg", brand: "Double Horse", price: 6.99 },
    { name: "Double Horse Garlic Pickle 1.1kg", brand: "Double Horse", price: 7.49 },
    { name: "Double Horse Garlic Pickle 1000g", brand: "Double Horse", price: 6.99 } // Exact equivalent
  ];
  const sizeRes = await callMatch(sizeProducts);
  sizeRes.products.forEach((p: any, i: number) => {
    console.log(`Test 3.${i+1}: ${p.name} -> ${p.matched_product_id ? 'MATCH (' + p.confidence + '%)' : 'NO_MATCH'}`);
    console.log(`  Method: ${p.match_method}, Reasons: ${p.match_reasons?.join(', ')}`);
  });

  // 4. AI FALLBACK TEST (Ambiguous)
  console.log("\n--- 4. AI FALLBACK TEST ---");
  const aiProducts = [
     // Naming it slightly differently to force AI if deterministic is just below threshold
     { name: "Premium Garlic Pickle by Double Horse 0.4kg", brand: "Double Horse", price: 3.49 }
  ];
  const aiRes = await callMatch(aiProducts);
  aiRes.products.forEach((p: any, i: number) => {
    console.log(`Test 4.${i+1}: ${p.name} -> ${p.matched_product_id ? 'MATCH (' + p.confidence + '%)' : 'NO_MATCH'}`);
    console.log(`  Method: ${p.match_method}, AI Used: ${p.ai_used}, Reasons: ${p.match_reasons?.join(', ')}`);
  });
}

run();
