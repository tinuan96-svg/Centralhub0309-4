import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  const { data, error } = await supabase.from('suppliers').select('*').limit(1);
  if (error) {
      console.error('Error fetching suppliers:', error);
      return;
  }
  if (data && data.length > 0) {
      console.log('Suppliers columns:', Object.keys(data[0]));
  } else {
      console.log('No suppliers found to check columns.');
      // Try to get one even if empty? Not possible with Postgrest to get schema easily.
      // But we can try to select specific columns to see if they exist.
      const testCols = ['id', 'name', 'code', 'email', 'phone', 'contact_email', 'contact_phone', 'address', 'city', 'country', 'payment_terms', 'currency', 'is_active', 'purchase_days'];
      for (const col of testCols) {
          const { error: colError } = await supabase.from('suppliers').select(col).limit(1);
          console.log(`Column ${col}: ${colError ? 'MISSING (' + colError.message + ')' : 'EXISTS'}`);
      }
  }
}

check();
