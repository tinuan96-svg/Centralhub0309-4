import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function probe() {
  const columns = ['name', 'code', 'contact_name', 'contact_email', 'contact_phone', 'email', 'phone', 'address', 'city', 'country', 'payment_terms', 'currency', 'is_active', 'purchase_days', 'notes', 'rating'];
  const validCols: string[] = [];

  for (const col of columns) {
      const { error } = await supabase.from('suppliers').select(col).limit(1);
      if (!error) {
          validCols.push(col);
          console.log(`Column [${col}] EXISTS`);
      } else {
          console.log(`Column [${col}] MISSING: ${error.message}`);
      }
  }

  console.log('\nSummary of valid columns:', validCols);
}

probe();
