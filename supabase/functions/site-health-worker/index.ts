import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const AUDIENCE = "centralhub-site-health";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function res(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isForbiddenPath(path: string): boolean {
  const p = path.replaceAll("\\", "/").toLowerCase();
  if (!p || p.includes("..") || p.startsWith("/") || p.includes("\0")) return true;
  if (p.startsWith(".github/") || p.startsWith("supabase/") || p.startsWith("android/") || p.startsWith("ios/")) return true;
  if (p === "netlify.toml" || p === "package.json" || p.endsWith("package-lock.json") || p.endsWith("yarn.lock") || p.endsWith("pnpm-lock.yaml")) return true;
  if (p.startsWith(".env") || p.includes("/secrets") || p.includes("credential")) return true;
  const segments = p.split("/");
  const blockedSegments = new Set(["payment", "payments", "checkout", "auth", "authentication", "order", "orders", "admin"]);
  return segments.some((segment) => blockedSegments.has(segment));
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return (part as Record<string, unknown>).text as string;
    }
  }
  return "";
}

async function verifyGithub(req: Request, expectedRepo: string) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("missing_oidc_token");
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
  if (String(payload.repository ?? "") !== expectedRepo) throw new Error("repository_mismatch");
  if (String(payload.ref ?? "") !== "refs/heads/main") throw new Error("ref_not_allowed");
  const expectedWorkflow = `${expectedRepo}/.github/workflows/site-health-autofix.yml@refs/heads/main`;
  if (String(payload.workflow_ref ?? "") !== expectedWorkflow) throw new Error("workflow_not_allowed");
  const event = String(payload.event_name ?? "");
  if (!["schedule", "workflow_dispatch"].includes(event)) throw new Error("event_not_allowed");
  return payload;
}

async function getStoreAndConfig(db: ReturnType<typeof createClient>, storeSlug: string) {
  const { data: store } = await db.from("stores").select("id,slug,name,domain").eq("slug", storeSlug).maybeSingle();
  if (!store) throw new Error("unknown_store");
  const { data: config } = await db.from("site_health_store_configs").select("*").eq("store_id", store.id).maybeSingle();
  if (!config || !config.github_repo) throw new Error("store_not_configured");
  return { store, config };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return res(405, { ok: false, error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return res(500, { ok: false, error: "server_not_configured" });
  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return res(400, { ok: false, error: "invalid_json" }); }
  const action = String(body.action ?? "");
  const storeSlug = String(body.store ?? "").trim().toLowerCase();
  if (!action || !storeSlug) return res(400, { ok: false, error: "missing_action_or_store" });

  let store: Record<string, unknown>;
  let config: Record<string, unknown>;
  try {
    ({ store, config } = await getStoreAndConfig(db, storeSlug));
    await verifyGithub(req, String(config.github_repo));
  } catch (e) {
    return res(401, { ok: false, error: e instanceof Error ? e.message : "unauthorized" });
  }

  if (!config.master_enabled || config.kill_switch || !config.auto_fix_enabled || !["guarded", "autonomous"].includes(String(config.execution_mode))) {
    return res(200, { ok: true, enabled: false, reason: "automation_disabled" });
  }

  if (action === "claim") {
    const { data: candidates, error } = await db.from("site_health_issues")
      .select("id,check_name,title,description,category,severity,risk_level,requires_preview,affected_pages,page_url,report_url,raw,first_seen_at")
      .eq("store_id", store.id)
      .eq("status", "queued")
      .eq("auto_fix_allowed", true)
      .in("risk_level", ["low", "medium"])
      .order("first_seen_at", { ascending: true })
      .limit(3);
    if (error) return res(500, { ok: false, error: "queue_read_failed" });
    for (const issue of candidates ?? []) {
      const { data: claimed } = await db.from("site_health_issues").update({ status: "fixing", last_seen_at: new Date().toISOString() }).eq("id", issue.id).eq("status", "queued").select("id").maybeSingle();
      if (!claimed) continue;
      const { data: attempt, error: attemptError } = await db.from("site_health_fix_attempts").insert({
        issue_id: issue.id,
        repository: config.github_repo,
        base_branch: config.production_branch ?? "main",
        status: "generating",
        ai_provider: "openai",
        ai_model: Deno.env.get("SITE_HEALTH_OPENAI_MODEL") ?? "gpt-5.6-sol"
      }).select("id").single();
      if (attemptError || !attempt) {
        await db.from("site_health_issues").update({ status: "queued" }).eq("id", issue.id);
        return res(500, { ok: false, error: "attempt_create_failed" });
      }
      const { data: rule } = await db.from("site_health_rules").select("max_files_changed,notes").eq("check_name", issue.check_name).maybeSingle();
      return res(200, {
        ok: true,
        has_issue: true,
        attempt_id: attempt.id,
        issue,
        limits: { max_files_changed: Number(rule?.max_files_changed ?? 6), max_context_bytes: 220000 },
        rule_notes: rule?.notes ?? null,
        domain: config.domain,
        repository: config.github_repo
      });
    }
    return res(200, { ok: true, has_issue: false });
  }

  if (action === "generate") {
    const attemptId = String(body.attempt_id ?? "");
    const files = Array.isArray(body.files) ? body.files as Array<Record<string, unknown>> : [];
    if (!attemptId || !files.length) return res(400, { ok: false, error: "missing_attempt_or_files" });

    const { data: attempt } = await db.from("site_health_fix_attempts").select("id,issue_id,repository,status").eq("id", attemptId).maybeSingle();
    if (!attempt || attempt.repository !== config.github_repo || !["generating", "patched"].includes(attempt.status)) return res(404, { ok: false, error: "attempt_not_available" });
    const { data: issue } = await db.from("site_health_issues").select("*").eq("id", attempt.issue_id).eq("store_id", store.id).maybeSingle();
    if (!issue) return res(404, { ok: false, error: "issue_not_found" });
    const { data: rule } = await db.from("site_health_rules").select("*").eq("check_name", issue.check_name).maybeSingle();
    const maxFiles = Math.min(Number(rule?.max_files_changed ?? 6), 12);

    const cleanFiles: Array<{ path: string; content: string }> = [];
    let total = 0;
    for (const file of files.slice(0, 20)) {
      const path = String(file.path ?? "");
      const content = String(file.content ?? "");
      if (isForbiddenPath(path)) continue;
      if (content.length > 90000) continue;
      total += content.length;
      if (total > 220000) break;
      cleanFiles.push({ path, content });
    }
    if (!cleanFiles.length) return res(400, { ok: false, error: "no_safe_context_files" });

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return res(503, { ok: false, error: "openai_not_configured" });
    const model = Deno.env.get("SITE_HEALTH_OPENAI_MODEL") ?? "gpt-5.6-sol";
    const prompt = `You are the CentralHub autonomous website repair agent. Return JSON only through the supplied schema.\n\nGoal: fix exactly one low/medium-risk SEO or performance issue with the smallest possible change. Preserve every existing business function and visible behavior except what is strictly necessary to fix the reported issue.\n\nABSOLUTE RULES:\n- Do not modify payment, checkout, authentication, order processing, database, Supabase migrations, CI/workflow, secrets, package/dependency, native Android/iOS, or deployment configuration.\n- Do not invent products, prices, legal claims, customer counts, shipping promises, or business facts.\n- Do not change URLs unless the issue specifically requires a deterministic internal redirect/canonical repair.\n- Only return changes for files included in CONTEXT FILES.\n- Use full replacement file contents. Do not omit unchanged sections from a changed file.\n- Maximum changed files: ${maxFiles}.\n- If the issue cannot be fixed safely from the supplied context, return an empty changes array and explain why in no_changes_reason.\n\nSTORE: ${String(store.name)} (${String(config.domain)})\nREPOSITORY: ${String(config.github_repo)}\nISSUE JSON:\n${JSON.stringify({ check_name: issue.check_name, title: issue.title, description: issue.description, category: issue.category, severity: issue.severity, risk_level: issue.risk_level, affected_pages: issue.affected_pages, page_url: issue.page_url, report_url: issue.report_url, rule_notes: rule?.notes ?? null })}\n\nCONTEXT FILES JSON:\n${JSON.stringify(cleanFiles)}\n\nProduce JSON matching the schema.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        input: prompt,
        max_output_tokens: 18000,
        text: {
          format: {
            type: "json_schema",
            name: "site_health_patch",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                changes: {
                  type: "array",
                  maxItems: maxFiles,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      path: { type: "string" },
                      content: { type: "string" },
                      rationale: { type: "string" }
                    },
                    required: ["path", "content", "rationale"]
                  }
                },
                no_changes_reason: { type: ["string", "null"] },
                risk_notes: { type: "array", items: { type: "string" }, maxItems: 8 }
              },
              required: ["changes", "no_changes_reason", "risk_notes"]
            }
          }
        }
      })
    });

    const raw = await openaiResponse.json() as Record<string, unknown>;
    if (!openaiResponse.ok) {
      await db.from("site_health_fix_attempts").update({ status: "failed", failure_reason: `openai_${openaiResponse.status}` }).eq("id", attemptId);
      await db.from("site_health_issues").update({ status: "failed" }).eq("id", issue.id);
      return res(502, { ok: false, error: "openai_request_failed", status: openaiResponse.status });
    }

    const text = extractOutputText(raw);
    let patch: Record<string, unknown>;
    try { patch = JSON.parse(text) as Record<string, unknown>; } catch {
      await db.from("site_health_fix_attempts").update({ status: "failed", failure_reason: "invalid_structured_output" }).eq("id", attemptId);
      await db.from("site_health_issues").update({ status: "failed" }).eq("id", issue.id);
      return res(502, { ok: false, error: "invalid_ai_output" });
    }

    const allowedPaths = new Set(cleanFiles.map((f) => f.path));
    const changes = (Array.isArray(patch.changes) ? patch.changes : []).filter((change) => {
      if (!change || typeof change !== "object") return false;
      const path = String((change as Record<string, unknown>).path ?? "");
      const content = String((change as Record<string, unknown>).content ?? "");
      return allowedPaths.has(path) && !isForbiddenPath(path) && content.length > 0 && content.length <= 120000;
    }).slice(0, maxFiles) as Array<Record<string, unknown>>;

    await db.from("site_health_fix_attempts").update({
      status: changes.length ? "patched" : "rejected",
      files_changed: changes.map((c) => c.path),
      failure_reason: changes.length ? null : String(patch.no_changes_reason ?? "No safe changes returned")
    }).eq("id", attemptId);
    if (!changes.length) await db.from("site_health_issues").update({ status: "open" }).eq("id", issue.id);

    return res(200, { ok: true, attempt_id: attemptId, changes, no_changes_reason: patch.no_changes_reason ?? null, risk_notes: patch.risk_notes ?? [] });
  }

  if (action === "report") {
    const attemptId = String(body.attempt_id ?? "");
    const outcome = String(body.outcome ?? "");
    const validation = body.validation && typeof body.validation === "object" ? body.validation as Record<string, unknown> : {};
    if (!attemptId || !["merged", "failed", "no_changes"].includes(outcome)) return res(400, { ok: false, error: "invalid_report" });
    const { data: attempt } = await db.from("site_health_fix_attempts").select("id,issue_id,repository").eq("id", attemptId).maybeSingle();
    if (!attempt || attempt.repository !== config.github_repo) return res(404, { ok: false, error: "attempt_not_found" });

    if (outcome === "merged") {
      const commitSha = body.commit_sha == null ? null : String(body.commit_sha);
      await db.from("site_health_fix_attempts").update({
        status: "merged",
        fix_branch: body.branch == null ? null : String(body.branch),
        pull_request_number: body.pr_number == null ? null : Number(body.pr_number),
        commit_sha: commitSha,
        validation_results: validation,
        completed_at: new Date().toISOString()
      }).eq("id", attemptId);
      await db.from("site_health_issues").update({ status: "verifying" }).eq("id", attempt.issue_id);
      await db.from("site_health_deployments").insert({ fix_attempt_id: attemptId, provider: config.deploy_provider ?? "netlify", commit_sha: commitSha, status: "pending", details: { source: "github_auto_merge" } });
      return res(200, { ok: true, status: "verifying" });
    }

    await db.from("site_health_fix_attempts").update({
      status: outcome === "failed" ? "failed" : "rejected",
      validation_results: validation,
      failure_reason: body.reason == null ? outcome : String(body.reason),
      completed_at: new Date().toISOString()
    }).eq("id", attemptId);
    await db.from("site_health_issues").update({ status: outcome === "failed" ? "failed" : "open" }).eq("id", attempt.issue_id);
    return res(200, { ok: true, status: outcome });
  }

  return res(400, { ok: false, error: "unknown_action" });
});
