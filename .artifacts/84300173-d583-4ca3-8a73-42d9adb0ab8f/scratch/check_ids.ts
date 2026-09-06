import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const ids = [
    'a7cd6d6c-b634-4818-a58e-788c177bc1a0', // Double Horse Garlic Pickle
    'cc4d7f26-3f0d-41ef-a6a2-1fc6845cb418', // Tasty Nibbles Lime Pickle
    '462dd440-fad9-490f-b981-e8611a4b84f1'  // Nirapara Cut Mango Pickle
  ];

  const { data: products } = await supabase
    .from('products')
    .select('id, name, brand, weight, unit, is_active, is_deleted')
    .in('id', ids);

  console.log(JSON.stringify(products, null, 2));
}

run();
