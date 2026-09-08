import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({
    error: 'CentralHub order creation is disabled',
    message: 'Create customer orders in the connected storefronts. CentralHub receives and manages store-originated orders.',
  }),
  {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  },
));
