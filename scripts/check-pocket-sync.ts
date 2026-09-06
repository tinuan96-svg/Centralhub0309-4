import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const pocketUrl = process.env.POCKET_SUPABASE_URL;
const pocketKey = process.env.POCKET_SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  if (!pocketUrl || !pocketKey) {
    console.log("Pocket credentials missing.");
    return;
  }
  const client = createClient(pocketUrl, pocketKey);
  const { data, error, count } = await client.from('products').select('id', { count: 'exact', head: false }).limit(5);

  if (error) {
    console.error("Error fetching PocketGrocery products:", error.message);
  } else {
    console.log(`PocketGrocery has ${data?.length} products (sample) out of ${count || 'unknown'} total.`);
    console.log(data);
  }
}

check().catch(console.error);
