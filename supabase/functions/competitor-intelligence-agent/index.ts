import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-competitor-scan-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const confidence01 = (v: unknown) => {
  const n = num(v, 0);
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
};
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const hoursOld = (value: unknown) => {
  if (!value) return 999999;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3600000) : 999999;
};
const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];
const safeModel = (value: string | undefined | null) => {
  const v = String(value || "").trim();
  if (!v || /^(sk-|sk-proj-|sess-|eyJ)/i.test(v) || v.length > 120) return "gpt-5.6-luna";
  return v;
};

async function authorize(req: Request, db: any, serviceRoleKey: string) {
  const cronSecret = String(req.headers.get("x-competitor-scan-secret") || "").trim();
  if (cronSecret) {
    const { data, error } = await db.rpc("verify_integration_cron_secret", {
      p_name: "competitor_scan_cron_secret",
      p_secret: cronSecret,
    });
    if (!error && data === true) return { ok: true, mode: "cron", userId: null };
  }

  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, mode: "none", userId: null };
  if (token === serviceRoleKey) return { ok: true, mode: "service_role", userId: null };

  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { ok: false, mode: "invalid_user", userId: null };
  if (String(user.app_metadata?.role || "").toLowerCase() === "admin") return { ok: true, mode: "admin", userId: user.id };
  const { data: profile } = await db.from("user_profiles").select("profile_role,is_active").eq("id", user.id).maybeSingle();
  return profile?.profile_role === "admin" && profile?.is_active !== false
    ? { ok: true, mode: "admin", userId: user.id }
    : { ok: false, mode: "forbidden", userId: user.id };
}

function textOut(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

async function aiSafetyReview(openaiKey: string, model: string, input: any) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 260,
      input: `You are Shruthi's competitor-pricing safety reviewer for a UK grocery business. A deterministic engine has already enforced product identity and calculated a candidate action. You may ONLY make the recommendation more conservative. Never invent prices and never authorize a price change. Review promotions, conditional/member pricing, shipping comparability, stock state, evidence count, match confidence and abnormal spreads. If evidence is not solid enough for a price movement, set safe_to_recommend_move=false.\n\nDATA:\n${JSON.stringify(input)}`,
      text: {
        format: {
          type: "json_schema",
          name: "competitor_safety_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              safe_to_recommend_move: { type: "boolean" },
              confidence_delta: { type: "number", minimum: -0.35, maximum: 0.05 },
              reason: { type: "string" },
              additional_flags: { type: "array", items: { type: "string" }, maxItems: 6 }
            },
            required: ["safe_to_recommend_move", "confidence_delta", "reason", "additional_flags"]
          }
        }
      }
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  try { return JSON.parse(textOut(payload).trim()); } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: "Server not configured" }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const access = await authorize(req, db, serviceRoleKey);
  if (!access.ok) return json({ success: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "analyze");
  if (action !== "analyze") return json({ success: false, error: "Unknown action" }, 400);

  const requestedBy = String(body?.requested_by || (access.mode === "admin" ? "admin-manual" : "shruthi-market-supervisor")).slice(0, 100);
  const requestedProductId = body?.product_id ? String(body.product_id) : null;
  const model = safeModel(Deno.env.get("OPENAI_MODEL_COMPETITOR_SUPERVISOR") || Deno.env.get("OPENAI_MODEL_FAST"));

  const { data: settingRows } = await db.from("pricing_settings").select("*").is("store_id", null).order("updated_at", { ascending: false }).limit(1);
  const settings = settingRows?.[0] || {};
  if (settings.competitor_ai_supervisor_enabled === false) return json({ success: false, error: "Competitor AI supervisor is disabled" }, 409);

  const freshnessHours = Math.max(1, num(settings.competitor_ai_review_freshness_hours, 48));
  const minCompetitors = Math.max(1, num(settings.competitor_ai_min_verified_competitors, 2));
  const minConfidence = Math.max(0.5, Math.min(1, num(settings.competitor_ai_min_confidence, 0.85)));
  const undercut = Math.max(0, num(settings.competitor_undercut_amount, 0.10));
  const maxIncreasePct = Math.min(10, Math.max(1, num(settings.max_price_increase_percent, 20)));
  const maxDecreasePct = Math.min(10, Math.max(1, num(settings.max_price_decrease_percent, 20)));

  const { data: run, error: runError } = await db.from("competitor_ai_runs").insert({
    status: "running",
    scope: requestedProductId ? `product:${requestedProductId}` : "primary_market",
    requested_by: requestedBy,
    model,
  }).select("id").single();
  if (runError || !run?.id) return json({ success: false, error: runError?.message || "Could not create AI supervisor run" }, 500);

  const runId = run.id;
  try {
    const { data: primaryCompetitors, error: compError } = await db.from("competitors")
      .select("id,name,market_key")
      .eq("is_primary_market", true)
      .eq("is_active", true)
      .not("website_url", "is", null)
      .order("display_order");
    if (compError) throw compError;
    const competitorIds = (primaryCompetitors || []).map((c: any) => c.id);
    if (!competitorIds.length) throw new Error("No active primary competitors configured");
    const competitorName = new Map((primaryCompetitors || []).map((c: any) => [c.id, c.name]));

    let productQuery = db.from("products")
      .select("id,name,sku,brand,price,cost_price,stock,min_margin,target_margin,weight,unit")
      .eq("is_active", true)
      .eq("is_deleted", false);
    if (requestedProductId) productQuery = productQuery.eq("id", requestedProductId);
    const { data: products, error: productError } = await productQuery.limit(1200);
    if (productError) throw productError;

    let priceQuery = db.from("competitor_prices").select("id,product_id,competitor_id,price,source_regular_price,source_sale_price,source_stock_status,shipping_fee,is_conditional,promotion_detail,match_confidence,match_status,match_method,brand_match,size_match,product_type_match,ai_used,ai_model,authoritative_eligible,data_quality_state,last_scanned_at,source_product_name,source_brand,source_size,source_unit_value,source_unit_type,normalised_unit_price,normalised_unit_type,product_measurement_match,product_measurement_reason,product_url")
      .in("competitor_id", competitorIds)
      .order("last_scanned_at", { ascending: false })
      .limit(5000);
    if (requestedProductId) priceQuery = priceQuery.eq("product_id", requestedProductId);
    const { data: priceRows, error: priceError } = await priceQuery;
    if (priceError) throw priceError;

    const rowsByProduct = new Map<string, any[]>();
    for (const row of priceRows || []) {
      if (!rowsByProduct.has(row.product_id)) rowsByProduct.set(row.product_id, []);
      rowsByProduct.get(row.product_id)!.push(row);
    }

    let keep = 0, reduce = 0, increase = 0, investigate = 0, aiReviewed = 0, analyzed = 0, missingVerified = 0;
    const reviewRows: any[] = [];
    const AI_CAP = 30;

    for (const product of products || []) {
      const allEvidence = rowsByProduct.get(product.id) || [];
      if (!allEvidence.length) continue;
      analyzed++;

      const valid = allEvidence.filter((r: any) => {
        const fresh = hoursOld(r.last_scanned_at) <= freshnessHours;
        const stock = String(r.source_stock_status || "unknown").toLowerCase();
        return r.authoritative_eligible === true
          && fresh
          && !r.is_conditional
          && r.price != null && num(r.price) > 0
          && !["out_of_stock", "unavailable"].includes(stock)
          && ["automatic", "manual"].includes(String(r.match_status || ""));
      });

      const flags: string[] = [];
      if (valid.length < minCompetitors) flags.push("INSUFFICIENT_VERIFIED_COMPETITORS");
      if (allEvidence.some((r: any) => r.is_conditional)) flags.push("CONDITIONAL_OR_MEMBER_PRICE_EXCLUDED");
      if (allEvidence.some((r: any) => num(r.shipping_fee) > 0)) flags.push("SHIPPING_NOT_DIRECTLY_COMPARABLE");
      if (allEvidence.some((r: any) => r.ai_used === true)) flags.push("AI_MATCH_PRESENT");
      if (allEvidence.some((r: any) => confidence01(r.match_confidence) > 0 && confidence01(r.match_confidence) < 0.95)) flags.push("LOWER_CONFIDENCE_MATCH_EXCLUDED");
      if (allEvidence.some((r: any) => r.product_measurement_match === false || r.size_match === false || r.product_type_match === false || r.brand_match === false)) flags.push("IDENTITY_OR_MEASUREMENT_REVIEW_PRESENT");
      if (allEvidence.some((r: any) => hoursOld(r.last_scanned_at) > freshnessHours)) flags.push("STALE_EVIDENCE_EXCLUDED");

      if (!valid.length) {
        missingVerified++;
        reviewRows.push({
          run_id: runId,
          product_id: product.id,
          action: "INVESTIGATE",
          confidence: 0.35,
          current_price: money(product.price),
          cost_price: money(product.cost_price),
          profit_floor_price: null,
          competitor_count: 0,
          reason: "Competitor listings exist, but none pass the current identity, freshness, stock and pricing-quality gates.",
          risk_flags: uniq([...flags, "NO_AUTHORITATIVE_MARKET_PRICE"]),
          evidence: { product: { name: product.name, brand: product.brand, sku: product.sku }, excluded_evidence_count: allEvidence.length },
          competitor_data_age_hours: Math.min(...allEvidence.map((r: any) => hoursOld(r.last_scanned_at))),
          ai_used: false,
          review_status: "pending",
          requires_approval: true,
        });
        investigate++;
        continue;
      }

      const marketPrices = valid.map((r: any) => num(r.price)).filter((v: number) => v > 0);
      const lowest = Math.min(...marketPrices);
      const highest = Math.max(...marketPrices);
      const average = marketPrices.reduce((a: number, b: number) => a + b, 0) / marketPrices.length;
      const med = median(marketPrices) ?? average;
      const current = num(product.price);
      const cost = num(product.cost_price);
      const minMarginPct = Math.max(0, Math.min(80, num(product.min_margin, 5)));
      const floor = cost > 0 ? cost / (1 - minMarginPct / 100) : null;
      const spreadPct = lowest > 0 ? ((highest - lowest) / lowest) * 100 : 0;
      const gapPct = lowest > 0 ? ((current - lowest) / lowest) * 100 : 0;
      if (spreadPct > 30) flags.push("HIGH_MARKET_SPREAD");
      if (Math.abs(gapPct) > 35) flags.push("LARGE_PRICE_GAP");
      if (!cost || cost <= 0) flags.push("MISSING_COST");

      let marketPosition = "NO_VALID_DATA";
      if (current <= lowest) marketPosition = "WE_ARE_CHEAPEST";
      else if (current <= lowest * 1.05) marketPosition = "WITHIN_5_PERCENT";
      else if (current < average) marketPosition = "BELOW_MARKET_AVERAGE";
      else marketPosition = "ABOVE_MARKET";

      let recommendation: "KEEP" | "REDUCE" | "INCREASE" | "INVESTIGATE" = "KEEP";
      let suggestedPrice: number | null = null;
      let confidence = valid.length >= 3 ? 0.94 : valid.length >= 2 ? 0.90 : 0.72;
      let reason = "Current price is reasonably aligned with verified market evidence.";

      if (!cost || cost <= 0) {
        recommendation = "INVESTIGATE";
        confidence = 0.45;
        reason = "Cost price is missing, so Shruthi will not recommend a price movement.";
      } else if (valid.length < minCompetitors) {
        if (Math.abs(gapPct) > 10) {
          recommendation = "INVESTIGATE";
          reason = `Only ${valid.length} verified competitor price is available and our price differs materially from it.`;
        } else {
          recommendation = "KEEP";
          reason = `Only ${valid.length} verified competitor price is available; keep the current price until the market sample is broader.`;
        }
        confidence = Math.min(confidence, 0.74);
      } else if (spreadPct > 30) {
        recommendation = "INVESTIGATE";
        confidence = 0.60;
        reason = "Verified competitor prices are too widely dispersed for a safe automatic recommendation.";
      } else if (current > lowest * 1.05) {
        const target = Math.max(floor!, lowest - undercut);
        const decreasePct = current > 0 ? ((current - target) / current) * 100 : 0;
        if (lowest - undercut < floor!) {
          recommendation = "KEEP";
          flags.push("COMPETITOR_BELOW_PROFIT_FLOOR");
          reason = "Matching the lowest verified market price would breach the configured profit floor, so keep the current price and monitor demand.";
        } else if (decreasePct > maxDecreasePct) {
          recommendation = "INVESTIGATE";
          flags.push("MOVEMENT_EXCEEDS_GUARDRAIL");
          confidence = 0.68;
          reason = `Closing the market gap would require a ${decreasePct.toFixed(1)}% reduction, beyond Shruthi's conservative ${maxDecreasePct}% recommendation guardrail.`;
        } else {
          recommendation = "REDUCE";
          suggestedPrice = money(target);
          reason = `Our price is ${gapPct.toFixed(1)}% above the lowest verified in-stock market price; the suggested price remains above the profit floor.`;
        }
      } else if (current < lowest * 0.90) {
        const marketCeiling = Math.max(current, lowest - undercut);
        const capped = Math.min(marketCeiling, current * (1 + maxIncreasePct / 100));
        if (capped > current && capped >= floor!) {
          recommendation = "INCREASE";
          suggestedPrice = money(capped);
          reason = "We are materially below all verified in-stock competitors; a conservative increase can improve margin while remaining below the lowest market price.";
        } else {
          recommendation = "KEEP";
          reason = "We are below market, but the available evidence does not justify a safe upward recommendation yet.";
        }
      }

      const ambiguous = flags.some(flag => [
        "CONDITIONAL_OR_MEMBER_PRICE_EXCLUDED",
        "SHIPPING_NOT_DIRECTLY_COMPARABLE",
        "AI_MATCH_PRESENT",
        "LOWER_CONFIDENCE_MATCH_EXCLUDED",
        "IDENTITY_OR_MEASUREMENT_REVIEW_PRESENT",
        "HIGH_MARKET_SPREAD",
        "LARGE_PRICE_GAP",
      ].includes(flag));
      let aiUsed = false;
      let aiReason: string | null = null;

      if (ambiguous && openaiKey && aiReviewed < AI_CAP) {
        const ai = await aiSafetyReview(openaiKey, model, {
          product: { name: product.name, brand: product.brand, current_price: current, cost_price: cost, size: product.weight, unit: product.unit },
          deterministic_recommendation: recommendation,
          deterministic_suggested_price: suggestedPrice,
          profit_floor_price: floor,
          market: { lowest, median: med, average, highest, verified_count: valid.length, spread_percent: spreadPct },
          risk_flags: uniq(flags),
          competitors: valid.map((r: any) => ({ name: competitorName.get(r.competitor_id), price: num(r.price), stock: r.source_stock_status, match_confidence: confidence01(r.match_confidence), match_method: r.match_method, shipping_fee: num(r.shipping_fee), conditional: !!r.is_conditional })),
        });
        if (ai) {
          aiUsed = true;
          aiReviewed++;
          confidence = Math.max(0.2, Math.min(0.99, confidence + num(ai.confidence_delta, 0)));
          flags.push(...(Array.isArray(ai.additional_flags) ? ai.additional_flags.map((x: unknown) => String(x).toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 80)) : []));
          aiReason = String(ai.reason || "").slice(0, 600) || null;
          if (["REDUCE", "INCREASE"].includes(recommendation) && ai.safe_to_recommend_move !== true) {
            recommendation = "INVESTIGATE";
            suggestedPrice = null;
            flags.push("AI_SAFETY_DOWNGRADE");
            reason = aiReason || "AI safety review found the evidence too ambiguous for a price-movement recommendation.";
          } else if (aiReason) {
            reason = `${reason} Shruthi review: ${aiReason}`.slice(0, 1200);
          }
        }
      }

      if (["REDUCE", "INCREASE"].includes(recommendation) && confidence < minConfidence) {
        flags.push("CONFIDENCE_BELOW_MOVEMENT_THRESHOLD");
        recommendation = "INVESTIGATE";
        suggestedPrice = null;
        reason = "The evidence is not strong enough to send a price movement recommendation to approval.";
      }

      const freshestAge = Math.min(...valid.map((r: any) => hoursOld(r.last_scanned_at)));
      const evidence = {
        product: { name: product.name, brand: product.brand, sku: product.sku, weight: product.weight, unit: product.unit },
        verified_competitors: valid.map((r: any) => ({
          competitor_id: r.competitor_id,
          competitor_name: competitorName.get(r.competitor_id),
          price: money(r.price),
          regular_price: money(r.source_regular_price),
          sale_price: money(r.source_sale_price),
          stock_status: r.source_stock_status,
          source_product_name: r.source_product_name,
          source_brand: r.source_brand,
          source_size: r.source_size,
          match_confidence: confidence01(r.match_confidence),
          match_method: r.match_method,
          last_scanned_at: r.last_scanned_at,
          product_url: r.product_url,
        })),
        excluded_evidence_count: Math.max(0, allEvidence.length - valid.length),
        deterministic: { spread_percent: spreadPct, gap_to_lowest_percent: gapPct, undercut_amount: undercut, max_increase_percent: maxIncreasePct, max_decrease_percent: maxDecreasePct },
      };

      reviewRows.push({
        run_id: runId,
        product_id: product.id,
        action: recommendation,
        confidence,
        current_price: money(current),
        cost_price: money(cost),
        profit_floor_price: money(floor),
        lowest_competitor_price: money(lowest),
        median_market_price: money(med),
        average_market_price: money(average),
        highest_competitor_price: money(highest),
        competitor_count: valid.length,
        suggested_price: suggestedPrice,
        market_position: marketPosition,
        reason,
        risk_flags: uniq(flags),
        evidence,
        competitor_data_age_hours: freshestAge,
        ai_used: aiUsed,
        ai_model: aiUsed ? model : null,
        review_status: "pending",
        requires_approval: true,
      });

      if (recommendation === "KEEP") keep++;
      else if (recommendation === "REDUCE") reduce++;
      else if (recommendation === "INCREASE") increase++;
      else investigate++;
    }

    for (const row of reviewRows) {
      await db.from("competitor_ai_reviews").update({ review_status: "superseded", updated_at: new Date().toISOString() }).eq("product_id", row.product_id).eq("review_status", "pending");
    }
    for (let i = 0; i < reviewRows.length; i += 100) {
      const { error } = await db.from("competitor_ai_reviews").insert(reviewRows.slice(i, i + 100));
      if (error) throw error;
    }

    const summary = {
      dry_run: true,
      auto_pricing: false,
      primary_competitors: (primaryCompetitors || []).map((c: any) => c.name),
      products_with_evidence: analyzed,
      products_without_authoritative_price: missingVerified,
      keep,
      reduce,
      increase,
      investigate,
      ai_safety_reviews: aiReviewed,
      movement_requires_manual_promotion_and_pricing_approval: true,
    };

    await db.from("competitor_ai_runs").update({ status: "completed", products_analyzed: reviewRows.length, keep_count: keep, reduce_count: reduce, increase_count: increase, investigate_count: investigate, ai_reviewed_count: aiReviewed, summary, completed_at: new Date().toISOString() }).eq("id", runId);
    await db.from("competitor_audit_logs").insert({ action: "AI_SUPERVISOR_COMPLETED", details: { run_id: runId, ...summary, requested_by: requestedBy, auth_mode: access.mode }, created_at: new Date().toISOString() });

    return json({ success: true, run_id: runId, ...summary, message: `Shruthi reviewed ${reviewRows.length} products: ${keep} keep · ${reduce} reduce · ${increase} increase · ${investigate} investigate. No prices were changed.` });
  } catch (error: any) {
    const message = String(error?.message || "Competitor intelligence analysis failed").slice(0, 700);
    await db.from("competitor_ai_runs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", runId);
    return json({ success: false, run_id: runId, error: message }, 500);
  }
});
