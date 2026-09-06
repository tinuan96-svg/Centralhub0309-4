import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
  console.log("Inspecting products table columns...");
  const { data: productsCols, error: productsError } = await supabase.rpc('get_table_columns', { table_name: 'products' });

  if (productsError) {
    // If RPC fails, try a direct query to information_schema if possible via SQL,
    // but usually we can't do that directly via postgrest unless enabled.
    // Let's try to just select one row even if empty to see if it returns keys if we use a different approach.
    console.error("RPC 'get_table_columns' failed. Trying alternative...");

    // Sometimes a select with no rows still gives metadata in some clients, but not here.
    // Let's try to fetch any record or just assume based on common patterns if we can't.
  } else {
    console.log("Products columns:", productsCols);
  }

  console.log("\nInspecting product_variants table columns...");
  const { data: variantsCols, error: variantsError } = await supabase.rpc('get_table_columns', { table_name: 'product_variants' });
  if (variantsError) {
    console.error("RPC 'get_table_columns' for variants failed.");
  } else {
    console.log("Variants columns:", variantsCols);
  }
}

inspect();
