import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: products } = await supabase
    .from('products')
    .select('name, brand, weight, unit, id')
    .eq('is_active', true)
    .limit(50);

  console.log(JSON.stringify(products, null, 2));
}

run();
