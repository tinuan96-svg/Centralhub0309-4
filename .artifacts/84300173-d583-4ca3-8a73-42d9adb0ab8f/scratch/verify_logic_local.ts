import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

const BRAND_ALIASES: Record<string, string> = {
  "ajmi": "ajmi",
  "aachi": "aachi",
  "malabar treats": "malabar treats",
  "elite malabar": "elite malabar",
  "top op": "top op",
  "grandmas": "grandmas",
  "tasty nibbles": "tasty nibbles",
  "prince foods": "prince foods",
  "nirapara": "nirapara",
  "unitaste": "unitaste",
  "double horse": "double horse",
  "comfort": "comfort",
  "lux": "lux"
};

function normalizeProductData(name: string, brand?: string | null, structuredWeight?: any, structuredUnit?: string | null) {
  let cleaned = name.toLowerCase();
  cleaned = cleaned.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const uiPatterns = [/by\s+/g, /brand\s*:/g, /regular price\s*:/g, /sale price\s*:/g, /price\s*:/g, /\d+%\s*off/g, /buy \d+ get \d+/g];
  uiPatterns.forEach(p => { cleaned = cleaned.replace(p, " "); });
  cleaned = cleaned.replace(/[^a-z0-9\s.gklmpx&]/g, " ").replace(/\s+/g, " ").trim();

  const sizeRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pcs|packet|packets|pack|pk|x|pieces|piece|gm|grams|gram|kilo|litre|litres)/i;
  const sizeMatch = cleaned.match(sizeRegex);

  let size = structuredWeight ? parseFloat(structuredWeight) : null;
  let unit = structuredUnit ? structuredUnit.toLowerCase() : null;

  if (sizeMatch) {
    size = parseFloat(sizeMatch[1]);
    const rawUnit = sizeMatch[2].toLowerCase();
    if (['g', 'gm', 'gram', 'grams'].includes(rawUnit)) unit = 'g';
    else if (['kg', 'kilo'].includes(rawUnit)) unit = 'kg';
    else if (['ml'].includes(rawUnit)) unit = 'ml';
    else if (['l', 'litre', 'litres'].includes(rawUnit)) unit = 'l';
    else if (['pcs', 'piece', 'pieces'].includes(rawUnit)) unit = 'pcs';
    else if (['pack', 'pk', 'packet', 'packets'].includes(rawUnit)) unit = 'pack';
    else unit = rawUnit;
    cleaned = cleaned.replace(sizeRegex, " ").replace(/\s+/g, " ").trim();
  } else if (unit) {
      if (['g', 'gm', 'gram', 'grams'].includes(unit)) unit = 'g';
      else if (['kg', 'kilo'].includes(unit)) unit = 'kg';
      else if (['ml'].includes(unit)) unit = 'ml';
      else if (['l', 'litre', 'litres'].includes(unit)) unit = 'l';
      else if (['pcs', 'piece', 'pieces'].includes(unit)) unit = 'pcs';
  }

  let detectedBrand = brand?.toLowerCase().trim() || null;
  if (detectedBrand && BRAND_ALIASES[detectedBrand]) detectedBrand = BRAND_ALIASES[detectedBrand];

  let brandInName = null;
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (cleaned.includes(alias)) {
      if (!detectedBrand) detectedBrand = canonical;
      brandInName = alias;
      break;
    }
  }

  let searchCleaned = cleaned;
  if (brandInName) searchCleaned = searchCleaned.replace(brandInName, " ");
  else if (detectedBrand) searchCleaned = searchCleaned.replace(detectedBrand, " ");

  const keywords = searchCleaned.split(' ').filter(w => w.length >= 4).map(w => w.trim());

  return { brand: detectedBrand, type: cleaned, size, unit, keywords };
}

async function findMatch(remoteProd: any) {
  const normRemote = normalizeProductData(remoteProd.name, remoteProd.brand, remoteProd.size);
  const searchTerms = normRemote.keywords.slice(0, 4);

  const { data: rawCandidates } = await supabase.from("products")
    .select("id, name, brand, weight, unit")
    .eq("is_deleted", false)
    .eq("is_active", true)
    .or(searchTerms.map(k => `name.ilike.%${k}%`).join(','));

  if (!rawCandidates || rawCandidates.length === 0) return { match: false, reason: "No candidates found for search terms: " + searchTerms.join(',') };

  for (const c of rawCandidates) {
    const normLocal = normalizeProductData(c.name, c.brand, c.weight, c.unit);

    // Brand Rule
    if (normLocal.brand && normRemote.brand && normLocal.brand !== normRemote.brand) continue;

    // Size Rule
    if (normLocal.size && normRemote.size) {
      const localValue = (normLocal.unit === 'kg' || normLocal.unit === 'l') ? normLocal.size * 1000 : normLocal.size;
      const remoteValue = (normRemote.unit === 'kg' || normRemote.unit === 'l') ? normRemote.size * 1000 : normRemote.size;
      if (Math.abs(localValue - remoteValue) > 0.1) continue;
    }

    // Type Integrity
    const criticalKeywords = ["mango", "lime", "lemon", "fish", "prawn", "chicken", "meat", "garlic", "ginger", "tapioca", "coconut", "jackfruit", "beans", "arvi", "yam", "mixture", "pickle", "powder", "chips", "65", "biriyani", "fried", "roasted", "sliced", "whole", "cut", "podi", "palada", "payasam", "puttu", "idli", "dosa", "appam", "pathiri", "rava", "wheat", "ragi", "matta", "ponni", "basmati", "soap", "conditioner", "liquid", "oil", "seeds", "tender", "kaduku", "maanga", "naranga", "inchi", "veluthulli", "meen", "chemeen", "erachi", "sharkara", "jaggery", "vadam", "kondattam", "pappadam"];
    let typeConflict = null;
    for (const k of criticalKeywords) {
       const remoteHas = new RegExp(`\\b${k}\\b`).test(normRemote.type);
       const localHas = new RegExp(`\\b${k}\\b`).test(normLocal.type);
       if (remoteHas !== localHas) {
          typeConflict = k;
          break;
       }
    }
    if (typeConflict) continue;

    return { match: true, product: c };
  }
  return { match: false, reason: "All candidates rejected by hard rules" };
}

async function run() {
  console.log("=== LOCAL LOGIC VERIFICATION ===");

  const test1 = await findMatch({ name: "Double Horse Garlic Pickle 400g", brand: "Double Horse" });
  console.log("Test 1 (Double Horse Garlic Pickle):", test1.match ? `MATCH (${test1.product?.name})` : `FAIL: ${test1.reason}`);

  const test2 = await findMatch({ name: "Tasty Nibbles Lime Pickle 400g", brand: "Tasty Nibbles" });
  console.log("Test 2 (Tasty Nibbles Lime Pickle):", test2.match ? `MATCH (${test2.product?.name})` : `FAIL: ${test2.reason}`);

  const test3 = await findMatch({ name: "Nirapara Mango Pickle 400g", brand: "Nirapara" });
  console.log("Test 3 (Mango vs Cut Mango):", test3.match ? `MATCH (${test3.product?.name})` : `PASS: No match (Correct rejection)`);
}

run();
