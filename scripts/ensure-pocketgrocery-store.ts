import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Checking for PocketGrocery store in CentralHub...');

  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name, slug')
    .eq('slug', 'pocketgrocery')
    .maybeSingle();

  if (error) {
    console.error('Error checking store:', error.message);
    return;
  }

  if (store) {
    console.log(`✅ Store found! ID: ${store.id}, Name: ${store.name}, Slug: ${store.slug}`);
  } else {
    console.log('⚠️ PocketGrocery store not found. Creating it...');
    const { data: newStore, error: createError } = await supabase
      .from('stores')
      .insert([
        {
          name: 'PocketGrocery',
          slug: 'pocketgrocery',
          color: '#10b981',
          max_display_stock: 50
        }
      ])
      .select()
      .single();

    if (createError) {
      console.error('❌ Failed to create store:', createError.message);
    } else {
      console.log('✅ Store created successfully!', newStore);
    }
  }
}

run();
