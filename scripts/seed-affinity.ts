import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
    console.log('Seed: Calculating Product Affinity from historical orders...');

    // Call the SQL function created in migration
    const { error } = await supabase.rpc('refresh_product_affinity');

    if (error) {
        console.error('Seed Failed:', error.message);
        process.exit(1);
    }

    console.log('✅ Product Affinity seeded successfully.');
}

seed();
