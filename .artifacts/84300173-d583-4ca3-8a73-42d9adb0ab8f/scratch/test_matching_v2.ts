/**
 * High Precision Matching Engine Regression Tests v2
 */

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
  "green valley": "green valley"
};

const CRITICAL_TYPES = ["mango", "lime", "lemon", "pickle", "powder", "mixture", "beans", "jackfruit", "fish", "prawn", "chicken", "meat", "garlic", "ginger", "tapioca", "coconut", "arvi", "yam", "chips"];

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

    // Canonical units
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
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (cleaned.includes(alias)) {
      if (!detectedBrand) detectedBrand = canonical;
    }
  }

  return { brand: detectedBrand, type: cleaned, size, unit };
}

function runMatch(local: any, remote: any): { match: boolean, reason: string } {
  const normLocal = normalizeProductData(local.name, local.brand, local.size, local.unit);
  const normRemote = normalizeProductData(remote.name, remote.brand, remote.size, remote.unit);

  // 1. Brand Rule
  if (normLocal.brand && normRemote.brand && normLocal.brand !== normRemote.brand) {
    return { match: false, reason: `Brand Mismatch: ${normLocal.brand} vs ${normRemote.brand}` };
  }

  // 2. Size Rule (Higher Precision)
  if (normLocal.size && normRemote.size) {
    const localVal = (normLocal.unit === 'kg' || normLocal.unit === 'l') ? normLocal.size * 1000 : normLocal.size;
    const remoteVal = (normRemote.unit === 'kg' || normRemote.unit === 'l') ? normRemote.size * 1000 : normRemote.size;

    // Explicit Tolerance Policy:
    // 0.1g/ml tolerance for floating point errors.
    // Materially different sizes (e.g. 500g vs 550g) will be rejected (diff=50).
    if (Math.abs(localVal - remoteVal) > 0.1) {
      return { match: false, reason: `Size Mismatch: ${localVal}g/ml vs ${remoteVal}g/ml` };
    }
  }

  // 3. Product Type Keyword Check
  for (const t of CRITICAL_TYPES) {
    if (normLocal.type.includes(t) !== normRemote.type.includes(t)) {
      return { match: false, reason: `Type Mismatch: "${t}" found in one but not other` };
    }
  }

  // 4. Name similarity (Simplified for test)
  const localWords = normLocal.type.split(' ').filter(w => w.length > 2);
  const remoteWords = normRemote.type.split(' ').filter(w => w.length > 2);
  const intersection = localWords.filter(w => remoteWords.includes(w));

  if (intersection.length === 0 && normLocal.type !== normRemote.type) {
      return { match: false, reason: "No name overlap" };
  }

  return { match: true, reason: "Passed Hard Rules" };
}

const tests = [
  { id: 1, local: { name: "Andhra Mixture", brand: "Malabar Treats" }, remote: { name: "Long Beans Mix 1Kg", brand: "Elite Malabar" }, expected: false },
  { id: 2, local: { name: "Elaichi Green", brand: "Top Op" }, remote: { name: "Jackfruit Green Sliced 1kg", brand: "Grandmas" }, expected: false },
  { id: 3, local: { name: "Cut Mango Pickle", brand: "Tasty Nibbles" }, remote: { name: "Green Beans Cut 400g", brand: "Prince Foods" }, expected: false },
  { id: 4, local: { name: "Chicken 65 Masala", brand: "Aachi" }, remote: { name: "Chicken Masala 200g", brand: "Ajmi" }, expected: false },
  { id: 5, local: { name: "Chemba Puttu Podi", brand: "Nirapara" }, remote: { name: "Chemba Puttu Podi 1kg", brand: "Prince Foods" }, expected: false },
  { id: 6, local: { name: "Fish Pickle", brand: "Tasty Nibbles", size: 400, unit: 'g' }, remote: { name: "Fish Pickle 400g", brand: "Tasty Nibbles" }, expected: true },
  { id: 7, local: { name: "Chicken Masala", brand: "Ajmi", size: 200, unit: 'g' }, remote: { name: "Chicken Masala 200g", brand: "Ajmi" }, expected: true },
  { id: 8, local: { name: "Mango Pickle", brand: "Unitaste", size: 500, unit: 'g' }, remote: { name: "Mango Pickle 1kg", brand: "Unitaste" }, expected: false }
];

console.log("=== REGRESSION TEST EXECUTION ===");
let passedCount = 0;
for (const t of tests) {
  const result = runMatch(t.local, t.remote);
  const success = result.match === t.expected;
  if (success) passedCount++;
  console.log(`TEST ${t.id}: ${success ? 'PASS' : 'FAIL'} | [${t.local.name} vs ${t.remote.name}] | ${result.reason}`);
}
console.log(`\nOVERALL: ${passedCount}/${tests.length} passed.`);
