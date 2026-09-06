import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log("Checking products table...");
  const { data: pData, error: pError } = await supabase.from('products').select('*').limit(1);
  if (pError) console.error("Error products:", pError);
  else console.log("Product columns:", Object.keys(pData[0] || {}));

  console.log("\nChecking product_variants table...");
  const { data: vData, error: vError } = await supabase.from('product_variants').select('*').limit(1);
  if (vError) console.error("Error variants:", vError);
  else console.log("Variant columns:", Object.keys(vData[0] || {}));
}

check();
