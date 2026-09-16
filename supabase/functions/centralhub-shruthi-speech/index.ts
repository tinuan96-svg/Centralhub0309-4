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
  if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured", voice_locked: true });

  const customVoiceId = String(Deno.env.get("SHRUTHI_CUSTOM_VOICE_ID") ?? "").trim();
  const namedVoice = String(Deno.env.get("SHRUTHI_TTS_VOICE") ?? "marin").trim() || "marin";
  const language = /[\u0D00-\u0D7F]/.test(text) ? "Malayalam-English bilingual" : "British English";
  const voice: string | { id: string } = customVoiceId ? { id: customVoiceId } : namedVoice;
  const model = Deno.env.get("SHRUTHI_TTS_MODEL") ?? "gpt-4o-mini-tts";

  let lastStatus = 0;
  let lastCode: string | null = null;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          instructions: `Speak as Shruthi, a natural, calm, warm, professional female executive assistant. Use ${language}. Sound human and conversational, not robotic. Keep a confident executive tone, natural pauses, and clear pronunciation.`,
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) {
          lastStatus = 502;
          lastCode = "empty_speech_audio";
        } else {
          return reply(200, {
            success: true,
            audioBase64: toBase64(bytes),
            mimeType: "audio/mpeg",
            provider: "openai",
            voice: customVoiceId ? "custom" : namedVoice,
            voice_locked: true,
          });
        }
      } else {
        lastStatus = response.status;
        const payload = await response.json().catch(() => null);
        lastCode = payload?.error?.code ?? payload?.error?.type ?? "speech_generation_failed";
      }

      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 180));
    }

    return reply(502, {
      success: false,
      error: "speech_generation_failed_same_voice_only",
      status: lastStatus || 502,
      upstream_code: lastCode,
      voice_locked: true,
    });
  } catch (error) {
    return reply(500, {
      success: false,
      error: error instanceof Error ? error.message : "speech_generation_error",
      voice_locked: true,
    });
  }
});
