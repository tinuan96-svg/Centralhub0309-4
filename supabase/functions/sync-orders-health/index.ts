const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (!['GET', 'POST'].includes(req.method)) {
    return reply({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) {
    return reply({ success: false, error: 'SUPABASE_URL is not configured' }, 500);
  }

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/sync-orders`, {
      method: 'OPTIONS',
      headers: {
        Origin: req.headers.get('Origin') || 'https://centralhub.network',
        'Access-Control-Request-Method': 'POST',
      },
    });

    return reply({
      success: upstream.ok,
      service: 'sync-orders',
      status: upstream.ok ? 'healthy' : 'unhealthy',
      upstream_status: upstream.status,
      checked_at: new Date().toISOString(),
    }, upstream.ok ? 200 : 503);
  } catch (error) {
    return reply({
      success: false,
      service: 'sync-orders',
      status: 'unreachable',
      error: error instanceof Error ? error.message : String(error),
      checked_at: new Date().toISOString(),
    }, 503);
  }
});
