import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  return new Response(JSON.stringify({
    error: "Deprecated store product endpoint. Stores use their own database and product propagation is handled by the active database-level sync architecture."
  }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
