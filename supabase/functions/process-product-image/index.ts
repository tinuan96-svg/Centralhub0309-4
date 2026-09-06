import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async () => new Response(JSON.stringify({error:"Product image processing has been permanently removed from CentralHub."}),{status:410,headers:{"Content-Type":"application/json"}}));
