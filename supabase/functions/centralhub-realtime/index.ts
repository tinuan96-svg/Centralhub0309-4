const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
if (!SUPABASE_URL) throw new Error('SUPABASE_URL is required');

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed. Use POST.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const incomingUrl = new URL(req.url);
    const targetUrl = `${SUPABASE_URL}/functions/v1/centralhub-product-sync${incomingUrl.search}`;

    const forwardHeaders = new Headers(req.headers);
    forwardHeaders.set('x-forwarded-by', 'centralhub-realtime-compat');

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: req.body,
    });

    const responseHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      responseHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});