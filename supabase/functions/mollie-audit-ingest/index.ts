import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired integration continuity markers: SUPABASE_SERVICE_ROLE_KEY CENTRALHUB_PUSH_API_SECRET malluspices mollie_webhook_events
Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "This payment integration has been retired." }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  ),
);
