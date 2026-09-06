import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: prods } = await supabase.from("products").select("*").eq("is_active", true).limit(5);
  console.log("ACTIVE CATALOG PRODUCTS:");
  console.log(JSON.stringify(prods, null, 2));
}

run();
