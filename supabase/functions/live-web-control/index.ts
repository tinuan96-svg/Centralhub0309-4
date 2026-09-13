import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizePublicHttps(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host === "::1") return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172) {
      const second = Number(private172[1]);
      if (second >= 16 && second <= 31) return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { success: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json(503, { success: false, error: "server_not_configured" });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { success: false, error: "missing_auth" });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { success: false, error: "invalid_auth" });

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || "").trim();
  const url = normalizePublicHttps(body?.url);
  const title = String(body?.title || "").trim().slice(0, 300);

  if (action === "history") {
    if (!url) return json(400, { success: false, error: "invalid_url" });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await db.from("live_web_history")
      .select("id")
      .eq("user_id", user.id)
      .eq("url", url)
      .gte("visited_at", fiveMinutesAgo)
      .order("visited_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.id) {
      await db.from("live_web_history").update({ title, visited_at: new Date().toISOString() }).eq("id", recent.id).eq("user_id", user.id);
    } else {
      const { error } = await db.from("live_web_history").insert({ user_id: user.id, url, title, source: "android_live_web" });
      if (error) return json(500, { success: false, error: error.message });
    }
    return json(200, { success: true, kind: "history_recorded" });
  }

  if (action === "toggle_bookmark") {
    if (!url) return json(400, { success: false, error: "invalid_url" });
    const { data: existing } = await db.from("live_web_bookmarks").select("id").eq("user_id", user.id).eq("url", url).maybeSingle();
    if (existing?.id) {
      await db.from("live_web_bookmarks").delete().eq("id", existing.id).eq("user_id", user.id);
      return json(200, { success: true, kind: "bookmark_removed", bookmarked: false });
    }
    const { error } = await db.from("live_web_bookmarks").insert({ user_id: user.id, url, title: title || new URL(url).hostname });
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, kind: "bookmark_added", bookmarked: true });
  }

  if (action === "monitor") {
    if (!url) return json(400, { success: false, error: "invalid_url" });
    const interval = [15, 30, 60, 180, 360, 720, 1440].includes(Number(body?.interval_minutes)) ? Number(body.interval_minutes) : 15;
    const label = String(body?.label || title || new URL(url).hostname).trim().slice(0, 300);
    const { data: existing } = await db.from("live_web_monitors").select("id").eq("user_id", user.id).eq("url", url).maybeSingle();
    if (existing?.id) {
      const { error } = await db.from("live_web_monitors").update({
        enabled: true,
        interval_minutes: interval,
        label,
        next_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", existing.id).eq("user_id", user.id);
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, kind: "monitor_enabled", monitor_id: existing.id });
    }
    const { data: created, error } = await db.from("live_web_monitors").insert({
      user_id: user.id,
      url,
      label,
      interval_minutes: interval,
      enabled: true,
      next_check_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, kind: "monitor_created", monitor_id: created.id });
  }

  if (action === "unmonitor") {
    if (!url) return json(400, { success: false, error: "invalid_url" });
    const { error } = await db.from("live_web_monitors").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("url", url);
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, kind: "monitor_disabled" });
  }

  if (action === "new_session") {
    if (!url) return json(400, { success: false, error: "invalid_url" });
    const goal = String(body?.goal || "Inspect the current page and help the CentralHub admin.").trim().slice(0, 4000);
    const hostname = new URL(url).hostname;
    const { data: created, error } = await db.from("nora_action_sessions").insert({
      user_id: user.id,
      title: `Live Web · ${hostname}`,
      goal,
      target_system: hostname,
      target_url: url,
      status: "planned",
      risk_level: "medium",
      current_step: `Opening ${hostname}`,
      metadata: { source: "android_live_web", browser_mode: true },
    }).select("id").single();
    if (error || !created?.id) return json(500, { success: false, error: error?.message || "session_create_failed" });
    return json(200, { success: true, kind: "new_session", session_id: created.id });
  }

  if (action === "state") {
    const [{ data: bookmarks }, { data: history }, { data: monitors }] = await Promise.all([
      db.from("live_web_bookmarks").select("id,title,url,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      db.from("live_web_history").select("id,title,url,visited_at").eq("user_id", user.id).order("visited_at", { ascending: false }).limit(100),
      db.from("live_web_monitors").select("id,label,url,enabled,interval_minutes,last_checked_at,last_changed_at,last_summary,last_error").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]);
    return json(200, { success: true, kind: "state", bookmarks: bookmarks || [], history: history || [], monitors: monitors || [] });
  }

  return json(400, { success: false, error: "unsupported_action" });
});
