import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { success: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return reply(503, { success: false, error: "speech_not_configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply(401, { success: false, error: "missing_auth" });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { success: false, error: "invalid_auth" });
  if (String(user.app_metadata?.role ?? "").toLowerCase() !== "admin") {
    return reply(403, { success: false, error: "admin_required" });
  }

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { success: false, error: "invalid_json" }); }

  const text = String(body?.text ?? "").trim().slice(0, 2800);
  if (!text) return reply(400, { success: false, error: "missing_text" });

  // The Android app already has a native TTS engine kept warm in-process. Returning
  // immediately here makes the web client fall back to that engine instead of waiting
  // for a full cloud MP3 generation/download cycle before Shruthi starts talking.
  const userAgent = req.headers.get("user-agent") ?? "";
  const preferNative = body?.prefer_native_tts === true || /Android/i.test(userAgent);
  if (preferNative) {
    return reply(200, {
      success: false,
      error: "native_tts_preferred",
      provider: "android-native",
      fast_path: true,
    });
  }

  if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured" });

  const customVoiceId = String(Deno.env.get("SHRUTHI_CUSTOM_VOICE_ID") ?? "").trim();
  const namedVoice = String(Deno.env.get("SHRUTHI_TTS_VOICE") ?? "marin").trim() || "marin";
  const language = /[\u0D00-\u0D7F]/.test(text) ? "Malayalam-English bilingual" : "British English";
  const voice: string | { id: string } = customVoiceId ? { id: customVoiceId } : namedVoice;

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("SHRUTHI_TTS_MODEL") ?? "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: `Speak as Shruthi, a natural, calm, warm, professional female executive assistant. Use ${language}. Sound human and conversational, not robotic. Keep a confident executive tone, natural pauses, and clear pronunciation.`,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return reply(502, {
        success: false,
        error: "speech_generation_failed",
        status: response.status,
        upstream_code: payload?.error?.code ?? payload?.error?.type ?? null,
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return reply(502, { success: false, error: "empty_speech_audio" });

    return reply(200, {
      success: true,
      audioBase64: toBase64(bytes),
      mimeType: "audio/mpeg",
      provider: "openai",
      voice: customVoiceId ? "custom" : namedVoice,
    });
  } catch (error) {
    return reply(500, { success: false, error: error instanceof Error ? error.message : "speech_generation_error" });
  }
});