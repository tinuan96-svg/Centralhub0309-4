import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const importantHeaders = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
];

type ProbeResult = {
  path: string;
  ok: boolean;
  status: number | null;
  latency_ms: number;
  content_type: string | null;
  html_ok: boolean | null;
  angular_app_shell: boolean;
  error: string | null;
};

async function probe(origin: string, path: string): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const u = new URL(path, `${origin}/`);
    u.searchParams.set("centralhub_probe", Date.now().toString());
    const response = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent": "CentralHub-Security-Monitor/2.1",
        "cache-control": "no-cache",
        "pragma": "no-cache",
      },
    });
    const contentType = response.headers.get("content-type");
    let htmlOk: boolean | null = null;
    let angularAppShell = false;
    if (path === "/" || path === "/index.html") {
      const body = await response.text();
      const lower = body.toLowerCase();
      const looksLikeHtml = Boolean(contentType?.includes("text/html")) &&
        (lower.includes("<!doctype html") || lower.includes("<html"));
      htmlOk = response.ok && looksLikeHtml;
      angularAppShell = looksLikeHtml && lower.includes("<app-root");
    } else {
      await response.body?.cancel();
    }
    return {
      path,
      ok: response.ok,
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
      content_type: contentType,
      html_ok: htmlOk,
      angular_app_shell: angularAppShell,
      error: null,
    };
  } catch (cause) {
    return {
      path,
      ok: false,
      status: null,
      latency_ms: Math.round(performance.now() - started),
      content_type: null,
      html_ok: null,
      angular_app_shell: false,
      error: cause instanceof Error ? cause.message.slice(0, 240) : "probe_failed",
    };
  }
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !role) return json(500, { ok: false, error: "server_not_configured" });

  const db = createClient(url, role, { auth: { persistSession: false } });
  const { data: stores, error } = await db
    .from("stores")
    .select("id,name,slug,domain")
    .eq("visibility", true)
    .not("domain", "is", null);
  if (error) return json(500, { ok: false, error: "store_registry_unavailable" });

  const results = [];
  for (const store of stores || []) {
    const origin = `https://${String(store.domain).replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    const started = performance.now();
    let status: "online" | "degraded" | "offline" = "offline";
    let httpStatus: number | null = null;
    let missing: string[] = importantHeaders;
    let detail: string | null = null;

    const rootProbe = await probe(origin, "/");
    const requiresIndexHtml = rootProbe.angular_app_shell === true;
    const indexProbe = requiresIndexHtml ? await probe(origin, "/index.html") : null;

    const rootFailed = !rootProbe.ok || rootProbe.html_ok === false;
    const indexFailed = requiresIndexHtml && (!indexProbe?.ok || indexProbe?.html_ok === false);
    const appShellFailed = rootFailed || indexFailed;
    httpStatus = indexProbe?.status ?? rootProbe.status;

    try {
      const headerResponse = await fetch(`${origin}/?centralhub_headers=${Date.now()}`, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          "user-agent": "CentralHub-Security-Monitor/2.1",
          "cache-control": "no-cache",
        },
      });
      missing = importantHeaders.filter((header) => !headerResponse.headers.get(header));
      await headerResponse.body?.cancel();
    } catch {
      // Availability is determined by the route probes above.
    }

    if (appShellFailed) {
      status = "offline";
      const failed = [rootProbe, indexProbe].filter((p): p is ProbeResult => Boolean(p) && (!p!.ok || p!.html_ok === false));
      detail = failed.map((p) => `${p.path}:${p.status ?? "network"}${p.error ? `:${p.error}` : p.html_ok === false ? ":invalid_html" : ""}`).join(" | ").slice(0, 240) || "storefront_probe_failed";
    } else {
      status = missing.length <= 1 ? "online" : "degraded";
    }

    const latency = Math.round(performance.now() - started);
    const score = status === "offline"
      ? 0
      : Math.max(35, 100 - missing.length * 12 - (latency > 2500 ? 10 : latency > 1200 ? 5 : 0));
    const checkedAt = new Date().toISOString();

    const { data: previous } = await db
      .from("security_heartbeats")
      .select("status,security_score")
      .eq("store_id", store.id)
      .eq("source", "centralhub_probe")
      .maybeSingle();

    const probeDetails = {
      missing,
      framework_mode: requiresIndexHtml ? "angular_app_shell" : "generic_html",
      probes: {
        root: rootProbe,
        index_html: indexProbe,
      },
    };

    await db.from("security_heartbeats").upsert({
      store_id: store.id,
      source: "centralhub_probe",
      status,
      latency_ms: latency,
      http_status: httpStatus,
      tls_valid: rootProbe.status !== null || indexProbe?.status !== null,
      security_headers: probeDetails,
      security_score: score,
      detail,
      checked_at: checkedAt,
    }, { onConflict: "store_id,source" });

    if (status !== "offline") {
      await db.from("security_events")
        .update({ status: "resolved", resolved_at: checkedAt, last_seen_at: checkedAt })
        .eq("store_id", store.id)
        .eq("source", "centralhub_probe")
        .eq("event_type", "availability_failure")
        .in("status", ["open", "acknowledged"]);
    }
    if (status === "online") {
      await db.from("security_events")
        .update({ status: "resolved", resolved_at: checkedAt, last_seen_at: checkedAt })
        .eq("store_id", store.id)
        .eq("source", "centralhub_probe")
        .eq("event_type", "security_headers")
        .in("status", ["open", "acknowledged"]);
    }

    const eventType = status === "offline" ? "availability_failure" : missing.length ? "security_headers" : "recovered";
    const severity = status === "offline" ? "critical" : status === "degraded" ? "medium" : "info";
    const fingerprint = `${store.id}:centralhub_probe:${status}:${[...missing].sort().join(",")}`;
    const title = status === "offline"
      ? `${store.name} storefront is unavailable`
      : missing.length
      ? `${store.name} security headers need attention`
      : `${store.name} recovered`;
    const details = {
      http_status: httpStatus,
      latency_ms: latency,
      missing_headers: missing,
      detail,
      framework_mode: probeDetails.framework_mode,
      probes: probeDetails.probes,
    };

    if (status !== "online") {
      const { data: existing } = await db.from("security_events")
        .select("id")
        .eq("fingerprint", fingerprint)
        .in("status", ["open", "acknowledged"])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await db.from("security_events").update({ severity, title, details, last_seen_at: checkedAt }).eq("id", existing.id);
      } else {
        if (eventType === "security_headers") {
          await db.from("security_events")
            .update({ status: "resolved", resolved_at: checkedAt, last_seen_at: checkedAt })
            .eq("store_id", store.id)
            .eq("source", "centralhub_probe")
            .eq("event_type", "security_headers")
            .in("status", ["open", "acknowledged"]);
        }
        await db.from("security_events").insert({
          store_id: store.id,
          source: "centralhub_probe",
          event_type: eventType,
          severity,
          status: "open",
          title,
          details,
          fingerprint,
          occurred_at: checkedAt,
          last_seen_at: checkedAt,
        });
      }
    } else if (!previous || previous.status !== "online") {
      await db.from("security_events").insert({
        store_id: store.id,
        source: "centralhub_probe",
        event_type: "recovered",
        severity: "info",
        status: "resolved",
        title,
        details,
        fingerprint,
        occurred_at: checkedAt,
        last_seen_at: checkedAt,
        resolved_at: checkedAt,
      });
    }

    await db.from("site_health_store_configs").update({ last_verified_at: checkedAt }).eq("store_id", store.id);
    results.push({
      store: store.slug,
      status,
      http_status: httpStatus,
      latency_ms: latency,
      security_score: score,
      missing_headers: missing,
      framework_mode: probeDetails.framework_mode,
      probes: probeDetails.probes,
    });
  }

  return json(200, { ok: true, checked_at: new Date().toISOString(), results });
});
