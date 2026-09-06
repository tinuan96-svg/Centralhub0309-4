import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are a voice assistant for a warehouse picker.
Interpret the user's command and return a JSON action.

CONTEXT:
User is currently picking items.

ACTIONS:
- PICK: User confirmed picking the current item (e.g., "got it", "picked 5", "done")
- NEXT: User wants to skip or move forward (e.g., "next", "skip this", "move on")
- BACK: User wants to go to the previous item (e.g., "go back", "last one")
- REPEAT: User wants the item details again (e.g., "repeat", "what was that?")
- PAUSE: User wants to stop listening (e.g., "pause", "wait a second")
- RESUME: User wants to start listening again (e.g., "resume", "ready")
- FINISH: User is done with all orders (e.g., "finish", "complete session")
- UPDATE_STOCK: User found different stock count (e.g., "set stock to 5", "there are zero left")
- UPDATE_LOCATION: User found item in new place (e.g., "move location to B-12", "new shelf is A-2")

OUTPUT FORMAT:
{
  "action": "PICK" | "NEXT" | "BACK" | "REPEAT" | "PAUSE" | "RESUME" | "FINISH" | "UPDATE_STOCK" | "UPDATE_LOCATION" | "UNKNOWN",
  "message": "Short feedback to say to the user",
  "value": "Optional string or number value for updates (e.g. 5 for stock, 'B-12' for location)"
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { command, context } = await req.json();
    const startTime = Date.now();
    const model = Deno.env.get("OPENAI_MODEL_PICKING_AI") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: 'user', content: `Command: "${command}"\nCurrent Context: ${context}` },
        ],
        temperature: 0,
        max_tokens: 50,
        response_format: { type: "json_object" }
      }),
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    // 1. Resolve Supabase for Logging
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await supabase.from('ai_usage_logs').insert({
        feature: 'picking_assistant',
        model: model,
        request_type: 'command_interpretation',
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens,
        duration_ms: Date.now() - startTime,
        status: response.ok ? 'success' : 'failed'
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
