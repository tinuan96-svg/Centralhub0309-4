import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { error } = await supabase.from('store_deletion_audit').select('count', { count: 'exact', head: true }).limit(0);
  if (error) {
    console.log(`❌ store_deletion_audit MISSING or errored: ${error.message} (${error.code})`);
  } else {
    console.log(`✅ store_deletion_audit exists`);
  }
}

check();
