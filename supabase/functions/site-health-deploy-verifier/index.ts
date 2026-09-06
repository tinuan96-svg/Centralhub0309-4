import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const cleanHost = (value: unknown) => String(value ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();

async function githubContains(repo: string, baseSha: string, headSha: string): Promise<boolean> {
  if (!baseSha || !headSha) return false;
  if (baseSha === headSha) return true;
  const token = (Deno.env.get("GITHUB_TOKEN") ?? Deno.env.get("GITHUB_PAT") ?? "").trim();
  if (!token || !repo) return false;
  const r = await fetch(`https://api.github.com/repos/${repo}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!r.ok) return false;
  const body = await r.json().catch(() => ({})) as Record<string, unknown>;
  return body.status === "ahead" || body.status === "identical";
}
async function findNetlifySite(token: string, domain: string) {
  const r = await fetch("https://api.netlify.com/api/v1/sites?per_page=100", { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`netlify_sites_${r.status}`);
  const sites = await r.json().catch(() => []) as Array<Record<string, unknown>>; const wanted = cleanHost(domain);
  return sites.find((site) => [site.custom_domain, site.url, site.ssl_url, site.name ? `${site.name}.netlify.app` : null].map(cleanHost).filter(Boolean).includes(wanted)) ?? null;
}
async function annotateBlocked(db: ReturnType<typeof createClient>, deployment: Record<string, any>, reason: string) { await db.from("site_health_deployments").update({ details: { ...(deployment.details ?? {}), verifier: "site-health-deploy-verifier", verifier_blocked: reason, verifier_checked_at: new Date().toISOString() } }).eq("id", deployment.id); return { id: deployment.id, status: "pending", reason }; }
async function verifyOne(db: ReturnType<typeof createClient>, deployment: Record<string, any>, netlifyToken: string) {
  const { data: attempt } = await db.from("site_health_fix_attempts").select("id,issue_id,repository,base_branch,commit_sha").eq("id", deployment.fix_attempt_id).maybeSingle(); if (!attempt?.issue_id || !attempt.commit_sha) return annotateBlocked(db, deployment, "attempt_incomplete");
  const { data: issue } = await db.from("site_health_issues").select("id,store_id,status,check_name").eq("id", attempt.issue_id).maybeSingle(); if (!issue?.store_id) return annotateBlocked(db, deployment, "issue_missing");
  const { data: config } = await db.from("site_health_store_configs").select("store_id,domain,github_repo,production_branch,deploy_provider,master_enabled,kill_switch,verify_after_deploy").eq("store_id", issue.store_id).maybeSingle();
  if (!config || !config.master_enabled || config.kill_switch || !config.verify_after_deploy) return annotateBlocked(db, deployment, "verification_disabled"); if ((config.deploy_provider ?? "netlify") !== "netlify") return annotateBlocked(db, deployment, "unsupported_provider"); if (!netlifyToken) return annotateBlocked(db, deployment, "netlify_auth_token_missing");
  const site = await findNetlifySite(netlifyToken, config.domain); if (!site?.id) return annotateBlocked(db, deployment, "netlify_site_not_found");
  const deploysResp = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(String(site.id))}/deploys?per_page=100`, { headers: { Authorization: `Bearer ${netlifyToken}` } }); if (!deploysResp.ok) throw new Error(`netlify_deploys_${deploysResp.status}`);
  const deploys = await deploysResp.json().catch(() => []) as Array<Record<string, any>>; const productionBranch = String(config.production_branch ?? attempt.base_branch ?? "main"); let matched: Record<string, any> | null = null;
  for (const d of deploys) { const state = String(d.state ?? ""); const branch = String(d.branch ?? d.commit_ref_branch ?? ""); const context = String(d.context ?? ""); if (state !== "ready") continue; if (branch && branch !== productionBranch && context !== "production") continue; const headSha = String(d.commit_ref ?? d.commit_sha ?? ""); if (await githubContains(String(config.github_repo ?? attempt.repository ?? ""), String(attempt.commit_sha), headSha)) { matched = d; break; } }
  if (!matched) { const exactFailed = deploys.find((d) => String(d.commit_ref ?? d.commit_sha ?? "") === String(attempt.commit_sha) && ["error", "failed"].includes(String(d.state ?? ""))); if (exactFailed) { await db.from("site_health_deployments").update({ deploy_id: exactFailed.id == null ? null : String(exactFailed.id), deploy_url: exactFailed.ssl_url ?? exactFailed.deploy_ssl_url ?? exactFailed.url ?? null, status: "failed", production_verified: false, details: { ...(deployment.details ?? {}), verifier: "netlify_api", netlify_state: exactFailed.state, verified_reason: "deploy_failed" } }).eq("id", deployment.id); await db.from("site_health_verifications").insert({ issue_id: issue.id, deployment_id: deployment.id, source: "netlify", status: "fail", details: { reason: "deploy_failed", netlify_deploy_id: exactFailed.id ?? null } }); return { id: deployment.id, status: "failed", reason: "deploy_failed" }; } return annotateBlocked(db, deployment, "production_deploy_not_ready"); }
  const liveUrl = `https://${cleanHost(config.domain)}/?centralhub_site_health_verify=${Date.now()}`; const live = await fetch(liveUrl, { redirect: "follow", headers: { "User-Agent": "CentralHub-SiteHealth-Verifier/1.0", "Cache-Control": "no-cache" } }); if (live.status >= 500) return annotateBlocked(db, deployment, `live_http_${live.status}`);
  const now = new Date().toISOString(); const deployUrl = matched.ssl_url ?? matched.deploy_ssl_url ?? matched.url ?? null;
  await db.from("site_health_deployments").update({ deploy_id: matched.id == null ? null : String(matched.id), deploy_url: deployUrl, status: "verified", production_verified: true, verified_at: now, details: { ...(deployment.details ?? {}), verifier: "netlify_api+github_ancestry+live_http", verifier_blocked: null, netlify_state: matched.state ?? null, deployed_commit: matched.commit_ref ?? matched.commit_sha ?? null, fix_commit: attempt.commit_sha, live_http_status: live.status, live_final_url: live.url, verified_at: now } }).eq("id", deployment.id);
  await db.from("site_health_verifications").insert({ issue_id: issue.id, deployment_id: deployment.id, source: "netlify", status: "pass", details: { phase: "production_deployment", netlify_deploy_id: matched.id ?? null, fix_commit: attempt.commit_sha, deployed_commit: matched.commit_ref ?? matched.commit_sha ?? null, live_http_status: live.status }, checked_at: now }); await db.from("site_health_store_configs").update({ last_verified_at: now, updated_at: now }).eq("store_id", issue.store_id); return { id: deployment.id, status: "verified", issue: issue.check_name };
}
Deno.serve(async (req: Request) => {
  if (req.method === "GET") return reply(200, { ok: true, service: "centralhub-site-health-deploy-verifier" }); if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL"); const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !serviceRole) return reply(503, { ok: false, error: "supabase_not_configured" }); const db = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = req.headers.get("x-site-health-worker-secret") ?? ""; const { data: secretOk, error: secretError } = await db.rpc("verify_site_health_deploy_worker_secret", { p_secret: secret }); if (secretError || secretOk !== true) return reply(401, { ok: false, error: "invalid_worker_secret" });
  const { data: pending, error } = await db.from("site_health_deployments").select("id,fix_attempt_id,provider,commit_sha,status,details,created_at").in("status", ["pending", "building", "deployed"]).eq("production_verified", false).order("created_at", { ascending: true }).limit(10); if (error) return reply(500, { ok: false, error: "pending_read_failed" });
  const netlifyToken = (Deno.env.get("NETLIFY_AUTH_TOKEN") ?? "").trim(); const results: Array<Record<string, unknown>> = []; for (const deployment of pending ?? []) { try { results.push(await verifyOne(db, deployment, netlifyToken)); } catch (e) { results.push(await annotateBlocked(db, deployment, e instanceof Error ? e.message : "verification_error")); } }
  return reply(200, { ok: true, checked: results.length, external_config: { netlify: Boolean(netlifyToken) }, results });
});
