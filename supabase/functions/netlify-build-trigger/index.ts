import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CENTRALHUB_SITE_ID = "afc83a5b-e361-450d-9d0d-febfc59d94ae";
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const netlifyToken = (Deno.env.get("NETLIFY_AUTH_TOKEN") ?? "").trim();
  if (!supabaseUrl || !serviceRole || !netlifyToken) return reply(503, { ok: false, error: "server_not_configured" });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const internalServiceCall = Boolean(bearer) && bearer === serviceRole;

  if (!internalServiceCall) {
    const secret = req.headers.get("x-site-health-worker-secret") ?? "";
    const { data: secretOk, error: secretError } = await db.rpc("verify_site_health_deploy_worker_secret", { p_secret: secret });
    if (secretError || secretOk !== true) return reply(401, { ok: false, error: "invalid_worker_authorization" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const siteId = String(body.site_id ?? "").trim();
  if (!siteId) return reply(400, { ok: false, error: "site_id_required" });

  const { data: configs } = await db.from("site_health_store_configs")
    .select("netlify_site_id,master_enabled,kill_switch,auto_fix_enabled,execution_mode")
    .not("netlify_site_id", "is", null);

  const configBySite = new Map<string, any>((configs ?? []).map((row: any) => [String(row.netlify_site_id ?? ""), row]));
  const allowed = new Set<string>([CENTRALHUB_SITE_ID, ...configBySite.keys()].filter(Boolean));
  if (!allowed.has(siteId)) return reply(403, { ok: false, error: "site_not_allowed" });

  if (internalServiceCall && siteId !== CENTRALHUB_SITE_ID) {
    const config = configBySite.get(siteId);
    const guarded = config?.master_enabled === true
      && config?.kill_switch !== true
      && config?.auto_fix_enabled === true
      && ["guarded", "autonomous"].includes(String(config?.execution_mode || ""));
    if (!guarded) return reply(403, { ok: false, error: "store_autofix_not_enabled" });
  }

  const response = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`, {
    method: "POST",
    headers: { Authorization: `Bearer ${netlifyToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clear_cache: body.clear_cache === true }),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) return reply(502, { ok: false, error: `netlify_build_${response.status}` });

  return reply(200, {
    ok: true,
    site_id: siteId,
    build_id: result.id ?? null,
    state: result.state ?? null,
    created_at: result.created_at ?? null,
    trigger: internalServiceCall ? "centralhub_internal_recovery" : "site_health_worker",
  });
});
