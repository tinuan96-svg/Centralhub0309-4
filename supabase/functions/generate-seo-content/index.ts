import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are an expert ecommerce SEO copywriter specializing in Kerala grocery products in the UK market.

Your task is to generate high-converting, SEO-optimized product content for "Kerala Groceries UK".

TARGET AUDIENCE:
- Malayali customers in the UK
- People searching for authentic Kerala food products
- Keywords like: Kerala groceries UK, Indian groceries UK, buy Kerala food online UK

RULES:
- Do NOT repeat same phrase excessively
- Keep it readable and natural
- Avoid generic phrases like "best quality product"
- Focus on authenticity + cultural connection

OUTPUT FORMAT (STRICT JSON, no markdown, no extra text):
{
  "product_description": "",
  "seo_title": "",
  "seo_keywords": [],
  "seo_description": ""
}`;

function buildUserPrompt(name: string, category: string): string {
  return `INPUT PRODUCT:
Name: ${name}
Category: ${category}

INSTRUCTIONS:

1. PRODUCT DESCRIPTION:
- 80–120 words
- Natural, human tone
- Highlight authenticity, taste, and use case
- Mention Kerala origin if relevant
- Subtly include UK-based keywords (DO NOT keyword stuff)

2. SEO TITLE:
- Max 60 characters
- Include primary keyword + product name
- Example style: "Buy Amla Pickle Online UK | Kerala Groceries"

3. SEO KEYWORDS:
- 8–12 keywords
- Include: product-specific keywords, Kerala groceries UK variations, Indian grocery UK terms

4. SEO DESCRIPTION (META DESCRIPTION):
- 140–160 characters
- Must be click-worthy
- Include UK + Kerala relevance

Return ONLY the JSON object, no markdown fences.`;
}

async function generateForProduct(
  openaiKey: string,
  name: string,
  category: string,
  supabase?: any
): Promise<{ product_description: string; seo_title: string; seo_keywords: string[]; seo_description: string }> {
  const startTime = Date.now();
  const model = Deno.env.get("OPENAI_MODEL_SEO_GENERATION") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(name, category) },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";

  // Log Usage
  if (supabase) {
    await supabase.from('ai_usage_logs').insert({
        feature: 'seo_generation',
        model: model,
        request_type: 'generation',
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens,
        duration_ms: Date.now() - startTime,
        status: 'success'
    });
  }

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));

    // mode: "single" | "bulk"
    // single: { mode: "single", id: number }
    // bulk:   { mode: "bulk", ids?: number[] }  — omit ids to process all nulls
    const mode: string = body.mode ?? "single";

    if (mode === "single") {
      const { id } = body;
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id is required for single mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: row, error: fetchErr } = await supabase
        .from("keralagroceries")
        .select("id, product_display_name, category_name")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr || !row) {
        return new Response(
          JSON.stringify({ error: fetchErr?.message ?? "Row not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const content = await generateForProduct(
        openaiKey,
        row.product_display_name,
        row.category_name ?? "",
        supabase
      );

      const { error: updateErr } = await supabase
        .from("keralagroceries")
        .update({
          product_description: content.product_description,
          seo_title: content.seo_title,
          seo_keywords: content.seo_keywords.join(", "),
          seo_description: content.seo_description,
        })
        .eq("id", id);

      if (updateErr) throw updateErr;

      return new Response(
        JSON.stringify({ success: true, id, content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "bulk") {
      // Process up to 20 at a time to stay within function timeout
      const BATCH_SIZE = 20;

      let query = supabase
        .from("keralagroceries")
        .select("id, product_display_name, category_name");

      if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
        query = query.in("id", body.ids);
      } else {
        // Only process rows that have no description yet
        query = query.is("product_description", null).limit(BATCH_SIZE);
      }

      const { data: rows, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      if (!rows || rows.length === 0) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, message: "No rows to process" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: { id: number; status: "ok" | "error"; error?: string }[] = [];

      for (const row of rows) {
        try {
          const content = await generateForProduct(
            openaiKey,
            row.product_display_name,
            row.category_name ?? ""
          );

          await supabase
            .from("keralagroceries")
            .update({
              product_description: content.product_description,
              seo_title: content.seo_title,
              seo_keywords: content.seo_keywords.join(", "),
              seo_description: content.seo_description,
            })
            .eq("id", row.id);

          results.push({ id: row.id, status: "ok" });
        } catch (err: any) {
          results.push({ id: row.id, status: "error", error: err.message });
        }
      }

      const processed = results.filter((r) => r.status === "ok").length;
      return new Response(
        JSON.stringify({ success: true, processed, total: rows.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown mode: ${mode}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-seo-content error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
