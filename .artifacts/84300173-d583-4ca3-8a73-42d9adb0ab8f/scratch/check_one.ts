import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data } = await supabase.from('competitor_prices').select('*').eq('product_id', 'a7cd6d6c-b634-4818-a58e-788c177bc1a0');
  console.log(JSON.stringify(data, null, 2));
}

run();
