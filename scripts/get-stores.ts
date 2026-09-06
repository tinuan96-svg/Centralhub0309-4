import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  const { data: stores, error } = await supabase.from('stores').select('id, name, slug, domain, visibility, max_display_stock, bucket_name, created_at');
  if (error) {
    console.error('Error fetching stores:', error);
  } else {
    console.log('Stores:', JSON.stringify(stores, null, 2));
  }
}

check();
