import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  return new Response(JSON.stringify({
    error: "Deprecated product sync endpoint. Product propagation is handled by the active database-level direct sync trigger."
  }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
