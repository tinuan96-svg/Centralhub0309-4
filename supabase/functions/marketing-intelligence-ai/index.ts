import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.101.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { action, store_id, product_id, platform, language, topic, context } = await req.json();

    // 1. GENERATE MARKETING CONTENT (AI Content Studio)
    if (action === "generate_content") {
      if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

      let dynamicContext = "";
      if (store_id) {
         const { data: store } = await supabase.from('stores').select('name').eq('id', store_id).single();
         if (store) dynamicContext += `Store: ${store.name}. `;
      }

      if (product_id) {
         const { data: product } = await supabase.from('products').select('name, price').eq('id', product_id).single();
         if (product) dynamicContext += `Product: ${product.name}, Price: ${product.price}. `;
      }

      const prompt = `You are a professional marketing copywriter for CentralHub, an Android retail management platform.
      Generate marketing content for the following:
      Platform: ${platform}
      Language: ${language}
      Topic: ${topic}
      ${dynamicContext}
      ${context ? `Additional Context: ${JSON.stringify(context)}` : ""}

      Requirements:
      - If bilingual, mix English and Malayalam naturally.
      - Tone: Professional, engaging, and sales-oriented.
      - Include emojis relevant to the platform.
      - Max length: 200 words.`;

      const startTime = Date.now();
      const model = Deno.env.get("OPENAI_MODEL_MARKETING_AI") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      });

      const aiData = await response.json();
      const generatedText = aiData.choices?.[0]?.message?.content || "Failed to generate content.";

      // Log Usage
      await supabase.from('ai_usage_logs').insert({
          feature: 'marketing_content',
          model: model,
          request_type: 'generation',
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          total_tokens: aiData.usage?.total_tokens,
          duration_ms: Date.now() - startTime,
          status: response.ok ? 'success' : 'failed'
      });

      return new Response(JSON.stringify({ text: generatedText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. ANALYZE PRODUCT OPPORTUNITY (Marketing Intelligence)
    if (action === "analyze_product_opportunity") {
      const { data: product } = await supabase
        .from("products")
        .select("*, inventory:central_inventory(*), economics:product_economics(*)")
        .eq("id", product_id)
        .single();

      if (!product) throw new Error("Product not found");

      let aiAnalysis = {
        title: `Opportunity: ${product.name}`,
        description: `Margin: ${product.economics?.margin_percent}%, Stock: ${product.inventory?.stock_quantity}`,
        reason: "Calculated based on healthy margin and available stock.",
        proposed_action: "Increase visibility via social media.",
        expected_impact: "Moderate growth expected.",
        confidence: 0.8
      };

      if (openaiKey) {
        const startTime = Date.now();
        const model = Deno.env.get("OPENAI_MODEL_MARKETING_AI") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";
        const prompt = `Analyze this product for marketing opportunities:
        Name: ${product.name}
        Category: ${product.category}
        Price: ${product.price}
        Margin: ${product.economics?.margin_percent}%
        Stock: ${product.inventory?.stock_quantity}

        Return a JSON object with: title, description, reason, proposed_action, expected_impact (string), confidence (0-1).`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
          }),
        });

        const aiData = await response.json();
        aiAnalysis = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

        // Log Usage
        await supabase.from('ai_usage_logs').insert({
            feature: 'product_opportunity',
            model: model,
            request_type: 'analysis',
            prompt_tokens: aiData.usage?.prompt_tokens,
            completion_tokens: aiData.usage?.completion_tokens,
            total_tokens: aiData.usage?.total_tokens,
            duration_ms: Date.now() - startTime,
            status: response.ok ? 'success' : 'failed'
        });
      }

      const { data: rec, error } = await supabase
        .from("intelligence_recommendations")
        .upsert({
          recommendation_type: "marketing_uplift",
          entity_type: "product",
          entity_id: product_id,
          store_id: store_id,
          title: aiAnalysis.title,
          description: aiAnalysis.description,
          reason: aiAnalysis.reason,
          proposed_action: aiAnalysis.proposed_action,
          expected_impact: aiAnalysis.expected_impact,
          confidence: aiAnalysis.confidence,
          risk_level: 2,
          status: "recommended",
          source_snapshot: {
            price: product.price,
            cost: product.cost_price,
            stock: product.inventory?.stock_quantity
          }
        }, { onConflict: store_id ? "recommendation_type, entity_id, store_id" : "recommendation_type, entity_id" })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(rec), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. GET PROMOTION EXPLANATION (Optional AI Layer)
    if (action === "explain_promotion") {
        if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
        const { simulation_result, simulation_params } = await req.json();

        const prompt = `You are a strategic retail analyst. Explain this promotion simulation result in 2 short sentences.
        Product: ${simulation_params.product_name}
        Discount: ${simulation_params.discount_percent}%
        Required Uplift: ${simulation_result.required_volume_uplift_percent}%
        Classification: ${simulation_result.classification}
        Margin: ${simulation_result.promotional_margin_percent}%

        Focus on the relationship between margin reduction and volume requirements. Do NOT repeat the exact numbers, explain the business implication.`;

        const startTime = Date.now();
        const model = Deno.env.get("OPENAI_MODEL_PROMOTION_EXPLANATION") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100
          }),
        });

        const aiData = await response.json();
        const text = aiData.choices?.[0]?.message?.content || "No explanation available.";

        // Log Usage
        await supabase.from('ai_usage_logs').insert({
            feature: 'promotion_explanation',
            model: model,
            request_type: 'explanation',
            prompt_tokens: aiData.usage?.prompt_tokens,
            completion_tokens: aiData.usage?.completion_tokens,
            total_tokens: aiData.usage?.total_tokens,
            duration_ms: Date.now() - startTime,
            status: response.ok ? 'success' : 'failed'
        });

        return new Response(JSON.stringify({ text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
