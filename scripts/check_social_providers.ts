import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) before running this script.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('--- CHECKING SOCIAL PROVIDERS ---');
  const { data, error } = await supabase
    .from('marketing_providers')
    .select('*')
    .eq('category', 'social');

  if (error) {
    console.error('Error fetching providers:', error.message);
  } else {
    console.log('Social Providers found:', JSON.stringify(data, null, 2));
  }

  console.log('\n--- CHECKING SOCIAL CONNECTIONS ---');
  const { data: connections, error: connError } = await supabase
    .from('marketing_connections')
    .select('*, provider:marketing_providers(*)');

  if (connError) {
    console.error('Error fetching connections:', connError.message);
  } else {
    const socialConnections = (connections ?? []).filter(
      (connection: any) => connection.provider?.category === 'social'
    );
    console.log('Social Connections found:', JSON.stringify(socialConnections, null, 2));
  }
}

check();
