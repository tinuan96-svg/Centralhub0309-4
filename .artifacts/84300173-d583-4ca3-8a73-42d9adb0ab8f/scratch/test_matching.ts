/**
 * Matching Engine Regression Tests
 * Run with: npx ts-node scratch/test_matching.ts
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
  "unitaste": "unitaste"
};

function normalizeProductData(name: string, brand?: string | null) {
  let cleaned = name.toLowerCase();
  cleaned = cleaned.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const uiPatterns = [/by\s+/g, /brand\s*:/g, /regular price\s*:/g, /sale price\s*:/g, /price\s*:/g, /\d+%\s*off/g, /buy \d+ get \d+/g];
  uiPatterns.forEach(p => { cleaned = cleaned.replace(p, " "); });
  cleaned = cleaned.replace(/[^a-z0-9\s.gklmpx&]/g, " ").replace(/\s+/g, " ").trim();

  const sizeRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pcs|packet|packets|pack|pk|x|pieces|piece|gm|grams|gram|kilo|litre|litres)/i;
  const sizeMatch = cleaned.match(sizeRegex);

  let size = null;
  let unit = null;
  if (sizeMatch) {
    size = parseFloat(sizeMatch[1]);
    const rawUnit = sizeMatch[2].toLowerCase();
    if (['g', 'gm', 'gram', 'grams'].includes(rawUnit)) unit = 'g';
    else if (['kg', 'kilo'].includes(rawUnit)) unit = 'kg';
    else unit = rawUnit;
    cleaned = cleaned.replace(sizeRegex, " ").replace(/\s+/g, " ").trim();
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

function testMatch(local: { name: string, brand: string }, remote: { name: string, brand: string }) {
  const normLocal = normalizeProductData(local.name, local.brand);
  const normRemote = normalizeProductData(remote.name, remote.brand);

  console.log(`\nTEST: "${local.name}" [${local.brand}] vs "${remote.name}" [${remote.brand}]`);

  // Hard Brand Rule
  if (normLocal.brand && normRemote.brand && normLocal.brand !== normRemote.brand) {
    console.log(`Result: NO_MATCH (Brand mismatch: ${normLocal.brand} vs ${normRemote.brand})`);
    return false;
  }

  // Hard Size Rule
  if (normLocal.size && normRemote.size) {
    const localVal = normLocal.unit === 'kg' ? normLocal.size * 1000 : normLocal.size;
    const remoteVal = normRemote.unit === 'kg' ? normRemote.size * 1000 : normRemote.size;
    if (Math.abs(localVal - remoteVal) > 0.1) {
      console.log(`Result: NO_MATCH (Size mismatch: ${normLocal.size}${normLocal.unit} vs ${normRemote.size}${normRemote.unit})`);
      return false;
    }
  }

  // Type keyword check
  const criticalTypes = ["mango", "lime", "lemon", "pickle", "powder", "mixture", "beans", "jackfruit"];
  for (const t of criticalTypes) {
    if (normLocal.type.includes(t) !== normRemote.type.includes(t)) {
      console.log(`Result: NO_MATCH (Type mismatch: ${t})`);
      return false;
    }
  }

  console.log(`Result: POTENTIAL MATCH (Passed hard rules)`);
  return true;
}

// Running Tests
testMatch({ name: "Andhra Mixture", brand: "Malabar Treats" }, { name: "Long Beans Mix 1Kg", brand: "Elite Malabar" });
testMatch({ name: "Elaichi Green", brand: "Top Op" }, { name: "Jackfruit Green Sliced 1kg", brand: "Grandmas" });
testMatch({ name: "Cut Mango Pickle", brand: "Tasty Nibbles" }, { name: "Green Beans Cut 400g", brand: "Prince Foods" });
testMatch({ name: "Chicken 65 Masala", brand: "Aachi" }, { name: "Chicken Masala 200g", brand: "Ajmi" });
testMatch({ name: "Fish Pickle", brand: "Tasty Nibbles" }, { name: "Fish Pickle", brand: "Tasty Nibbles" });
testMatch({ name: "Chicken Masala", brand: "Ajmi" }, { name: "Chicken Masala 200g", brand: "Ajmi" });
testMatch({ name: "Mango Pickle", brand: "Unitaste" }, { name: "Mango Pickle 1kg", brand: "Unitaste" });
