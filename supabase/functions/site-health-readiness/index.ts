import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => {
  const configured = (name: string) => Boolean((Deno.env.get(name) ?? '').trim());
  return new Response(JSON.stringify({
    ok: true,
    openai: configured('OPENAI_API_KEY'),
    github: configured('GITHUB_TOKEN') || configured('GITHUB_PAT'),
    netlify: configured('NETLIFY_AUTH_TOKEN'),
    centralhub_supabase: configured('SUPABASE_URL') && configured('SUPABASE_SERVICE_ROLE_KEY')
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
