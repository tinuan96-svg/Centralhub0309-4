import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Debugging Products Fetch...');

  // 1. Total products count
  const { count: totalCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log('Total Products in DB:', totalCount);

  // 2. Check filters
  const { count: activeCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  console.log('Active Products (is_active=true):', activeCount);

  const { count: notDeletedCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
  console.log('Not Deleted Products (is_deleted=false):', notDeletedCount);

  // 3. Try the specific query used in the dashboard
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, price, cost_price, stock, is_active')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .limit(5);

  if (error) {
    console.error('Query Error (without joins):', error);
  } else {
    console.log('Products found (without joins):', data?.length);
  }

  // 4. Try with joins
  const { data: dataWithJoins, error: errorWithJoins } = await supabase
    .from('products')
    .select('id, name, brands(name), categories(name)')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .limit(5);

  if (errorWithJoins) {
    console.error('Query Error (with joins):', errorWithJoins);
  } else {
    console.log('Products found (with joins):', dataWithJoins?.length);
  }
}

check();
