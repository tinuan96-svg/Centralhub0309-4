const { createClient } = require('@supabase/supabase-js');
// Need service role key to see logs since they are admin-only
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s.from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }

  const failures = data.filter(l => !l.success);
  console.log(`Recent failures: ${failures.length} out of ${data.length}`);
  failures.forEach(f => {
    console.log(`- Product: ${f.product_name || f.product_id}, Status: ${f.status_code}, Error: ${f.response_body?.slice(0, 100)}`);
  });
}

check();
