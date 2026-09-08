import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchRequest {
  action: "search" | "classify" | "trending";
  query?: string;
  productId?: string;
  productName?: string;
  productDescription?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SearchRequest = await req.json();

    if (body.action === "search" && body.query) {
      const query = body.query.toLowerCase().trim();
      const terms = query.split(/\s+/).filter((t: string) => t.length > 2);

      const { data: products } = await supabase
        .from("products")
        .select("id, name, slug, price, offer_price, images, brand_id, coin_reward, weight")
        .or(terms.map((t: string) => `name.ilike.%${t}%`).join(","))
        .limit(8);

      await supabase
        .from("product_search_log")
        .insert({ query, results_count: products?.length ?? 0, source: "ai_assistant" });

      return new Response(JSON.stringify({ products: products ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "classify" && body.productName) {
      const name = body.productName.toLowerCase();
      const desc = (body.productDescription ?? "").toLowerCase();
      const combined = `${name} ${desc}`;

      const categoryMap: Record<string, string[]> = {
        "Rice & Flour": ["rice", "matta", "flour", "atta", "podi", "puttu", "idiyappam", "dosa", "appam"],
        "Spices & Masalas": ["spice", "masala", "powder", "turmeric", "chilli", "pepper", "cardamom", "cinnamon", "sambar"],
        "Snacks & Sweets": ["chips", "banana", "mixture", "murukku", "sweet", "halwa", "laddu", "snack"],
        "Pickles & Chutneys": ["pickle", "achar", "chutney", "lime", "mango"],
        "Oils & Ghee": ["oil", "ghee", "coconut oil", "sesame"],
        "Frozen Foods": ["frozen", "parotta", "paratha"],
        "Ready to Eat": ["ready", "instant", "mix", "curry mix"],
        "Beverages": ["tea", "coffee", "drink", "juice"],
        "Coconut Products": ["coconut", "copra"],
      };

      const brandMap: Record<string, string[]> = {
        "Nirapara": ["nirapara"],
        "Eastern": ["eastern"],
        "Double Horse": ["double horse"],
        "Brahmins": ["brahmins"],
        "Kitchen Treasures": ["kitchen treasures"],
        "777": ["777"],
        "Melam": ["melam"],
        "Priya": ["priya"],
        "Aachi": ["aachi"],
      };

      let bestCategory = "Uncategorized";
      let bestCategoryScore = 0;
      for (const [cat, keywords] of Object.entries(categoryMap)) {
        const score = keywords.filter((k: string) => combined.includes(k)).length;
        if (score > bestCategoryScore) {
          bestCategory = cat;
          bestCategoryScore = score;
        }
      }

      let detectedBrand = "Unknown";
      for (const [brand, keywords] of Object.entries(brandMap)) {
        if (keywords.some((k: string) => combined.includes(k))) {
          detectedBrand = brand;
          break;
        }
      }

      const confidence = Math.min(0.99, 0.5 + bestCategoryScore * 0.15);

      return new Response(
        JSON.stringify({
          category: bestCategory,
          brand: detectedBrand,
          confidence,
          tags: Object.entries(categoryMap)
            .filter(([, kw]) => kw.some((k: string) => combined.includes(k)))
            .map(([cat]) => cat.toLowerCase().replace(/ & /g, "-")),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "trending") {
      const { data: searches } = await supabase
        .from("product_search_log")
        .select("query")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(200);

      const freq: Record<string, number> = {};
      (searches ?? []).forEach((s: { query: string }) => {
        const q = s.query.toLowerCase().trim();
        freq[q] = (freq[q] ?? 0) + 1;
      });

      const trending = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));

      return new Response(JSON.stringify({ trending }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
