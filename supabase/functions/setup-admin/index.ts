import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "This bootstrap endpoint has been retired. Use the authenticated CentralHub admin workflow instead.",
    }),
    { status: 410, headers: jsonHeaders },
  );
});
