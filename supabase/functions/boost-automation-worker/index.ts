import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.101.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExpiryRecord {
  id: string;
  product_id: string;
  expiry_date: string;
  quantity: number;
}

interface BoostRecord {
  id: string;
  product_id: string;
  store_id: string;
  end_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 5);

    const { data: expiringProducts, error: expiryError } = await supabase
      .from("product_expiry")
      .select("id, product_id, expiry_date, quantity")
      .lte("expiry_date", cutoffDate.toISOString().split("T")[0])
      .gt("quantity", 0);

    if (expiryError) {
      throw new Error(`Failed to fetch expiring products: ${expiryError.message}`);
    }

    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("id");

    if (storesError) {
      throw new Error(`Failed to fetch stores: ${storesError.message}`);
    }

    let boostedCount = 0;

    for (const store of stores || []) {
      for (const expiry of expiringProducts || []) {
        const { data: existingBoost } = await supabase
          .from("product_boosts")
          .select("id")
          .eq("product_id", expiry.product_id)
          .eq("store_id", store.id)
          .maybeSingle();

        if (existingBoost) {
          const { error: updateError } = await supabase
            .from("product_boosts")
            .update({
              boost_score: 80,
              reason: "expiry_auto",
              end_at: expiry.expiry_date,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingBoost.id);

          if (!updateError) boostedCount++;
        } else {
          const { error: insertError } = await supabase
            .from("product_boosts")
            .insert([{
              product_id: expiry.product_id,
              store_id: store.id,
              boost_score: 80,
              reason: "expiry_auto",
              start_at: new Date().toISOString(),
              end_at: expiry.expiry_date,
              is_active: true,
              created_by: "system",
            }]);

          if (!insertError) boostedCount++;
        }
      }
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: expiredBoosts, error: expiredError } = await supabase
      .from("product_boosts")
      .select("id, product_id, store_id")
      .eq("reason", "expiry_auto")
      .eq("is_active", true)
      .lt("end_at", today);

    let deactivatedCount = 0;

    for (const boost of expiredBoosts || []) {
      const { error: deactivateError } = await supabase
        .from("product_boosts")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", boost.id);

      if (!deactivateError) deactivatedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        boosted_count: boostedCount,
        deactivated_count: deactivatedCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Boost automation worker error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
