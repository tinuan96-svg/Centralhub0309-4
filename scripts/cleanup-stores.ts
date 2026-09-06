import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("Starting store cleanup...");

  // 1. Find Malluspices duplicate (malluspicescom)
  const { data: msDuplicate } = await supabase
    .from('stores')
    .select('id')
    .eq('slug', 'malluspicescom')
    .maybeSingle();

  if (msDuplicate) {
    console.log(`Deleting duplicate Malluspices (ID: ${msDuplicate.id})...`);
    await supabase.from('stores').delete().eq('id', msDuplicate.id);
  }

  // 2. Find Keralagroceries (original empty one)
  const { data: kgOriginal } = await supabase
    .from('stores')
    .select('id')
    .eq('slug', 'keralagroceries')
    .maybeSingle();

  if (kgOriginal) {
    console.log(`Deleting empty Keralagroceries (ID: ${kgOriginal.id})...`);
    await supabase.from('stores').delete().eq('id', kgOriginal.id);
  }

  // 3. Rename Source3 to Kerala Grocery and update slug
  const { data: source3 } = await supabase
    .from('stores')
    .select('id')
    .eq('slug', 'source3')
    .maybeSingle();

  if (source3) {
    console.log(`Renaming Source3 to Kerala Grocery...`);
    await supabase.from('stores').update({
      name: 'Kerala Grocery',
      slug: 'keralagroceries'
    }).eq('id', source3.id);
  }

  console.log("Cleanup finished.");
}

run();
