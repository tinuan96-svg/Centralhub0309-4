import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: mc } = await supabase.from('main_categories').select('id, name');
  console.log('Main Categories:', mc);

  const { data: c } = await supabase.from('categories').select('id, name');
  console.log('Sub Categories:', c);
}

check();
