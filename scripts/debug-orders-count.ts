import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log('Checking orders count...');

  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  if (error) {
      console.log('Error:', error.message);
  } else {
      console.log('Total orders in DB:', count);
  }

  const { data: stores } = await supabase.from('stores').select('id, name');
  for (const store of stores || []) {
      const { count: sCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id);
      console.log(`Store '${store.name}': ${sCount} orders`);
  }
}

check();
