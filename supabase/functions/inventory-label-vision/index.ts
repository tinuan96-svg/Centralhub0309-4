import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function bytesToBase64(bytes: Uint8Array) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(out);
}

function outputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function parseJsonLoose(text: string) {
  const raw = String(text || "").trim().replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("AI returned invalid JSON");
}

function cleanDate(value: unknown) {
  const v = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp01(value: unknown) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

async function requireUser(req: Request, admin: any) {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) throw new Error("Authorization required");
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser(bearer);
  if (error || !user) throw new Error("Invalid session");

  const { data: profile } = await admin
    .from("user_profiles")
    .select("profile_role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(profile?.profile_role || user.app_metadata?.role || "").toLowerCase();
  if (profile?.is_active === false || !["admin","superadmin","administrator"].includes(role)) {
    throw new Error("Admin access required");
  }
  return user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!url || !service) return json({ success: false, error: "server_not_configured" }, 503);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let user: any;
  try { user = await requireUser(req, db); }
  catch (error: any) { return json({ success: false, error: String(error?.message || error) }, 401); }

  const body = await req.json().catch(() => ({}));
  const photoId = String(body?.photo_id || "").trim();
  if (!photoId) return json({ success: false, error: "photo_id_required" }, 400);

  const { data: photo, error: photoError } = await db
    .from("inventory_audit_label_photos")
    .select("id,product_id,storage_path,file_name,mime_type,status,created_by")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError || !photo) return json({ success: false, error: "photo_not_found" }, 404);

  if (photo.created_by && photo.created_by !== user.id) {
    return json({ success: false, error: "photo_owner_mismatch" }, 403);
  }

  await db.from("inventory_audit_label_photos")
    .update({ status: "analysing", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", photo.id);

  try {
    const { data: blob, error: downloadError } = await db.storage
      .from("inventory-audit-labels")
      .download(photo.storage_path);
    if (downloadError || !blob) throw new Error(downloadError?.message || "Could not read label photo");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("Label photo is too large");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const b64 = bytesToBase64(bytes);
    const mime = String(photo.mime_type || blob.type || "image/jpeg").toLowerCase();
    const model = Deno.env.get("OPENAI_MODEL_DOCUMENTS") || Deno.env.get("OPENAI_MODEL_DEFAULT") || "gpt-5.6-luna";

    const developer = `You extract grocery retail-pack OR carton/box facts for a warehouse stock audit.
Read only what is visibly supported by the image. Never invent obscured or missing values.
The photo can be a retail pack front, retail pack back/side, or an outer carton.
Dates must be ISO YYYY-MM-DD.
Interpret BBE / best before / expiry / EXP as expiry_date.
Interpret Pkd / Packed / Packed on as packed_date. Do NOT call packed_date manufacture_date unless the label explicitly says manufacture/manufactured.
"Number of Packets", "x 24 Nos", "1L x 12" etc indicate pack_count only for outer cartons. A single retail pack photo does NOT imply pack_count=1.
weight_each_value/unit is the individual retail unit size, not the total carton net weight.
barcode should contain only the visible GTIN/EAN digits if confidently readable.
carton_no and batch_code are different fields when both are present.
label_type must be one of retail_pack, carton, unknown.
Return ONLY valid JSON exactly matching:
{"label_type":"retail_pack|carton|unknown","item_name":string|null,"brand":string|null,"barcode":string|null,"batch_code":string|null,"manufacture_date":"YYYY-MM-DD"|null,"packed_date":"YYYY-MM-DD"|null,"expiry_date":"YYYY-MM-DD"|null,"weight_each_value":number|null,"weight_each_unit":"g|kg|ml|l"|null,"pack_count":number|null,"carton_no":string|null,"net_quantity_text":string|null,"confidence":number,"notes":string|null}
If a field is blank or unreadable, use null. confidence must be 0..1.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          { role: "developer", content: [{ type: "input_text", text: developer }] },
          { role: "user", content: [
            { type: "input_text", text: "Extract the visible retail-pack or carton fields from this photo." },
            { type: "input_image", image_url: `data:${mime};base64,${b64}`, detail: "high" },
          ]},
        ],
        max_output_tokens: 1000,
      }),
    });

    const raw = await response.text();
    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI label analysis failed (${response.status})`);

    const parsed = parseJsonLoose(outputText(payload));
    const labelType = ["retail_pack","carton","unknown"].includes(String(parsed.label_type || "").toLowerCase())
      ? String(parsed.label_type).toLowerCase()
      : "unknown";

    const barcode = String(parsed.barcode || "").replace(/\D/g, "");
    const result = {
      label_type: labelType,
      item_name: parsed.item_name ? String(parsed.item_name).trim().slice(0, 200) : null,
      brand: parsed.brand ? String(parsed.brand).trim().slice(0, 120) : null,
      barcode: barcode.length >= 8 && barcode.length <= 14 ? barcode : null,
      batch_code: parsed.batch_code ? String(parsed.batch_code).trim().slice(0, 120) : null,
      manufacture_date: cleanDate(parsed.manufacture_date),
      packed_date: cleanDate(parsed.packed_date),
      expiry_date: cleanDate(parsed.expiry_date),
      weight_each_value: cleanNumber(parsed.weight_each_value),
      weight_each_unit: ["g","kg","ml","l"].includes(String(parsed.weight_each_unit || "").toLowerCase())
        ? String(parsed.weight_each_unit).toLowerCase() : null,
      pack_count: parsed.pack_count == null ? null : Math.max(0, Math.round(Number(parsed.pack_count) || 0)),
      carton_no: parsed.carton_no ? String(parsed.carton_no).trim().slice(0, 120) : null,
      net_quantity_text: parsed.net_quantity_text ? String(parsed.net_quantity_text).trim().slice(0, 200) : null,
      confidence: clamp01(parsed.confidence),
      notes: parsed.notes ? String(parsed.notes).trim().slice(0, 500) : null,
    };

    await db.from("inventory_audit_label_photos").update({
      status: "analysed",
      extracted_data: result,
      confidence: result.confidence,
      analysed_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", photo.id);

    return json({ success: true, result });
  } catch (error: any) {
    const message = String(error?.message || error).slice(0, 1000);
    await db.from("inventory_audit_label_photos").update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", photo.id);
    return json({ success: false, error: message }, 500);
  }
});
