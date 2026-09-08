import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Api-Key",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const configuredKey = Deno.env.get("GROCERYHUB_API_KEY") || "";

    if (configuredKey) {
      const providedKey =
        req.headers.get("X-Api-Key") ||
        req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      if (providedKey !== configuredKey) {
        return new Response(
          JSON.stringify({ error: "Invalid or missing API key." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "500", 10);
    const offsetParam = parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 500 : limitParam), 1000);
    const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

    const { data: products, error: fetchErr } = await supabase
      .from("catalog_products")
      .select(
        "id, name, gtin, stock_quantity, weight, weight_unit, sale_price, regular_price, brand, warehouse_location"
      )
      .eq("is_active", true)
      .order("name")
      .range(offset, offset + limit - 1);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch products.", detail: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mapped = (products || []).map(p => ({
      id: p.id,
      name: p.name,
      gtin: p.gtin || null,
      stock: p.stock_quantity ?? null,
      weight: p.weight != null ? `${p.weight}${p.weight_unit || "g"}` : null,
      sale_price: p.sale_price != null ? Number(p.sale_price) : null,
      regular_price: p.regular_price != null ? Number(p.regular_price) : null,
      brand: p.brand || null,
      location: p.warehouse_location || null,
    }));

    return new Response(JSON.stringify(mapped), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
