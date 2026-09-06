const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function hmac(secret: string, message: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, error: "Method not allowed" }, 405);
  const secret = Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") || "";
  if (!secret) return json({ valid: false, error: "Verifier is not configured" }, 500);
  const body = await req.json().catch(() => null);
  const timestamp = String(body?.timestamp || ""); const payload = typeof body?.payload === "string" ? body.payload : ""; const signature = String(body?.signature || "").toLowerCase();
  const ts = Number(timestamp);
  if (!timestamp || !payload || !signature || !Number.isFinite(ts)) return json({ valid: false, error: "Invalid signed request" }, 400);
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return json({ valid: false, error: "Signed request expired" }, 401);
  const expected = await hmac(secret, `${timestamp}.${payload}`);
  if (!timingSafeEqual(expected, signature)) return json({ valid: false, error: "Invalid signature" }, 401);
  return json({ valid: true });
});