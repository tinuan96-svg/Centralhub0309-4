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

async function transcribe(openaiKey: string, file: File, stage: string) {
  const prompt =
    `Warehouse stock audit. The speaker may use Malayalam, Indian English, Tamil, or mixed language. ` +
    `The current field is ${stage}. Keep rack letters/numbers and spoken quantities exact.`;

  const tryModel = async (model: string) => {
    const form = new FormData();
    form.append("model", model);
    form.append("file", file, file.name || "voice.webm");
    form.append("response_format", "json");
    form.append("prompt", prompt);

    return await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
  };

  const preferred = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
  let response = await tryModel(preferred);

  // Stable fallback for accounts where the preferred transcription model is unavailable.
  if (!response.ok && preferred !== "whisper-1" && [400, 404].includes(response.status)) {
    response = await tryModel("whisper-1");
  }

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { text: raw }; }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Transcription failed (${response.status})`);
  }

  return String(payload?.text || "").trim();
}

function outputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function normalizeCommand(openaiKey: string, stage: string, transcript: string) {
  if (!transcript) return "";

  const rules: Record<string, string> = {
    quantity:
      "Return ONLY the physical quantity as an integer, e.g. 25. Ignore every other word. If no quantity is stated, return EMPTY.",
    location:
      "Return ONLY the rack/bin/location code in compact uppercase form, e.g. B2-3 or K5. Ignore filler words. If none is stated, return EMPTY.",
    "pack-size":
      "Return ONLY '<number> <unit>' using unit g, kg, ml, or l, e.g. '500 g' or '1 l'. If the speaker says skip/same/no change, return SKIP. Otherwise return EMPTY.",
    confirm:
      "Return ONE of: APPROVE, CANCEL, 'QUANTITY <integer>', 'RACK <code>', 'PACK <number> <unit>', or UNKNOWN. APPROVE includes yes/save/confirm/okay. Translate Malayalam/Tamil equivalents by meaning.",
  };

  const instruction = rules[stage] || "Return a concise English normalization of the command.";
  const model = Deno.env.get("OPENAI_MODEL_DEFAULT") || "gpt-5.6-luna";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text:
              "You normalize short multilingual warehouse voice commands. Never invent a number or rack code. " +
              instruction,
          }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: transcript }],
        },
      ],
      max_output_tokens: 80,
    }),
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!response.ok) return transcript;

  const normalized = outputText(payload)
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (/^(EMPTY|UNKNOWN)$/i.test(normalized)) return "";
  if (/^SKIP$/i.test(normalized)) return "skip";
  if (/^APPROVE$/i.test(normalized)) return "approve";
  if (/^CANCEL$/i.test(normalized)) return "cancel";

  return normalized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!url || !service || !openaiKey) {
    return json({ success: false, error: "voice_service_not_configured" }, 503);
  }

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    await requireUser(req, db);
  } catch (error: any) {
    return json({ success: false, error: String(error?.message || error) }, 401);
  }

  try {
    const form = await req.formData();
    const file = form.get("audio");
    const stage = String(form.get("stage") || "").trim();

    if (!(file instanceof File)) return json({ success: false, error: "audio_required" }, 400);
    if (!["quantity","location","pack-size","confirm"].includes(stage)) {
      return json({ success: false, error: "invalid_stage" }, 400);
    }
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
      return json({ success: false, error: "invalid_audio_size" }, 400);
    }

    const transcript = await transcribe(openaiKey, file, stage);
    const normalized = await normalizeCommand(openaiKey, stage, transcript);

    return json({
      success: true,
      transcript,
      normalized,
      stage,
    });
  } catch (error: any) {
    return json({
      success: false,
      error: String(error?.message || error).slice(0, 1000),
    }, 500);
  }
});
