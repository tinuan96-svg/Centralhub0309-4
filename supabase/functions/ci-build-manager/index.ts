import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
const adminClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)
const githubToken = () => (Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_PAT') || '').trim()

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Authorization required')
  const db = adminClient()
  const { data: auth, error } = await db.auth.getUser(token)
  if (error || !auth.user) throw new Error('Invalid session')
  const { data: profile, error: profileError } = await db.from('user_profiles').select('profile_role,is_active').eq('id', auth.user.id).maybeSingle()
  if (profileError) throw profileError
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return { db, user: auth.user }
}

function githubHeaders() {
  const token = githubToken()
  if (!token) throw new Error('GitHub CI connection is not configured. Add GITHUB_TOKEN or GITHUB_PAT to Supabase Edge Function secrets.')
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json', 'User-Agent': 'CentralHub-CI' }
}

async function github(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...githubHeaders(), ...(init.headers || {}) } })
  const text = await response.text()
  let body: any = null
  if (text) { try { body = JSON.parse(text) } catch { body = { message: text.slice(0, 1000) } } }
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || body?.error || `GitHub returned ${response.status}`}`)
  return { response, body }
}

function repoParts(fullName: string) {
  const [owner, repo] = String(fullName || '').split('/')
  if (!owner || !repo) throw new Error('Project repository is invalid')
  return { owner, repo }
}

function safeStatus(run: any) {
  const allowed = new Set(['queued','requested','waiting','pending','in_progress','completed','success','failure','cancelled','timed_out','action_required','neutral','skipped','stale'])
  const raw = run?.status === 'completed' ? (run?.conclusion || 'completed') : (run?.status || 'queued')
  return allowed.has(raw) ? raw : (run?.status === 'completed' ? 'failure' : 'queued')
}

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null
  const value = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  return Number.isFinite(value) && value >= 0 ? value : null
}

async function projectFor(db: any, projectId: string) {
  const { data, error } = await db.from('ci_projects').select('*').eq('id', projectId).eq('enabled', true).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('CI/CD project not found or disabled')
  return data
}

async function buildFor(db: any, buildId: string) {
  const { data, error } = await db.from('ci_builds').select('*, project:ci_projects(*)').eq('id', buildId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Build not found')
  const project = Array.isArray(data.project) ? data.project[0] : data.project
  if (!project) throw new Error('Build project not found')
  return { ...data, project }
}

async function dispatch(db: any, user: any, projectId: string, branchInput?: string) {
  const project = await projectFor(db, projectId)
  const branch = (branchInput || project.default_branch || 'main').trim()
  const { data: build, error: buildError } = await db.from('ci_builds').insert({ project_id: project.id, workflow_file: project.workflow_file, workflow_name: project.name, branch, trigger_type: 'manual', status: 'requested', requested_by: user.id, dispatch_requested_at: new Date().toISOString(), metadata: { source: 'centralhub_ci_cd' } }).select('*').single()
  if (buildError) throw buildError
  const { owner, repo } = repoParts(project.repository_full_name)
  try {
    const workflow = encodeURIComponent(project.workflow_file)
    const result = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: branch, inputs: { centralhub_build_id: build.id } }) })
    const runId = result.body?.workflow_run_id ? Number(result.body.workflow_run_id) : null
    const values: Record<string, unknown> = { status: runId ? 'queued' : 'requested', last_synced_at: new Date().toISOString(), error_message: null }
    if (runId) values.external_run_id = runId
    if (result.body?.html_url) values.run_url = String(result.body.html_url)
    const { data: updated, error: updateError } = await db.from('ci_builds').update(values).eq('id', build.id).select('*').single()
    if (updateError) throw updateError
    return updated
  } catch (error: any) {
    await db.from('ci_builds').update({ status: 'failure', conclusion: 'failure', completed_at: new Date().toISOString(), error_message: error?.message || 'GitHub workflow dispatch failed', last_synced_at: new Date().toISOString() }).eq('id', build.id)
    throw error
  }
}

async function resolveRun(build: any) {
  const project = build.project
  const { owner, repo } = repoParts(project.repository_full_name)
  if (build.external_run_id) return (await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${build.external_run_id}`)).body
  const workflow = encodeURIComponent(project.workflow_file)
  const params = new URLSearchParams({ event: 'workflow_dispatch', branch: build.branch, per_page: '30' })
  const result = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflow}/runs?${params.toString()}`)
  const runs = Array.isArray(result.body?.workflow_runs) ? result.body.workflow_runs : []
  return runs.find((run: any) => String(run?.display_title || '').includes(build.id)) || null
}

async function syncBuild(db: any, buildId: string) {
  const build = await buildFor(db, buildId)
  const run = await resolveRun(build)
  if (!run) {
    const { data } = await db.from('ci_builds').update({ last_synced_at: new Date().toISOString() }).eq('id', build.id).select('*').single()
    return { build: data, steps: [], artifacts: [], waiting_for_run: true }
  }
  const project = build.project
  const { owner, repo } = repoParts(project.repository_full_name)
  const runId = Number(run.id)
  const steps: any[] = []
  const artifacts: any[] = []
  const jobsResult = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs?filter=latest&per_page=100`)
  const jobs = Array.isArray(jobsResult.body?.jobs) ? jobsResult.body.jobs : []
  for (const job of jobs) for (const step of (Array.isArray(job?.steps) ? job.steps : [])) {
    const row = { build_id: build.id, external_job_id: Number(job.id), external_step_number: Number(step.number), job_name: String(job.name || ''), name: String(step.name || `Step ${step.number}`), status: String(step.status || 'queued'), conclusion: step.conclusion ? String(step.conclusion) : null, started_at: step.started_at || null, completed_at: step.completed_at || null, duration_seconds: secondsBetween(step.started_at, step.completed_at), metadata: { runner_name: job.runner_name || null, runner_group_name: job.runner_group_name || null } }
    const { data, error } = await db.from('ci_build_steps').upsert(row, { onConflict: 'build_id,external_job_id,external_step_number' }).select('*').single()
    if (error) throw error
    steps.push(data)
  }
  if (run.status === 'completed') {
    const artifactResult = await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/artifacts?per_page=100`)
    const found = Array.isArray(artifactResult.body?.artifacts) ? artifactResult.body.artifacts : []
    for (const artifact of found) {
      const row = { build_id: build.id, external_artifact_id: Number(artifact.id), name: String(artifact.name || `artifact-${artifact.id}`), file_name: `${String(artifact.name || `artifact-${artifact.id}`)}.zip`, platform: project.platform, kind: 'github_actions_artifact', size_bytes: artifact.size_in_bytes == null ? null : Number(artifact.size_in_bytes), external_url: artifact.archive_download_url || null, expires_at: artifact.expires_at || null, metadata: { expired: Boolean(artifact.expired), digest: artifact.digest || null } }
      const { data, error } = await db.from('ci_artifacts').upsert(row, { onConflict: 'build_id,external_artifact_id' }).select('*').single()
      if (error) throw error
      artifacts.push(data)
    }
  }
  const startedAt = run.run_started_at || run.created_at || null
  const completedAt = run.status === 'completed' ? (run.updated_at || null) : null
  const patch = { external_run_id: runId, external_run_number: run.run_number == null ? null : Number(run.run_number), external_run_attempt: run.run_attempt == null ? null : Number(run.run_attempt), workflow_name: run.name || project.name, commit_sha: run.head_sha || null, status: safeStatus(run), conclusion: run.conclusion || null, run_url: run.html_url || null, started_at: startedAt, completed_at: completedAt, duration_seconds: secondsBetween(startedAt, completedAt), last_synced_at: new Date().toISOString(), error_message: run.conclusion === 'failure' ? 'GitHub Actions build failed. Open build steps for the failing stage.' : null, metadata: { ...(build.metadata || {}), event: run.event || null, actor: run.actor?.login || null, head_commit_message: run.head_commit?.message || null } }
  const { data: updated, error: updateError } = await db.from('ci_builds').update(patch).eq('id', build.id).select('*').single()
  if (updateError) throw updateError
  return { build: updated, steps, artifacts, waiting_for_run: false }
}

async function artifactLink(db: any, artifactId: string) {
  const { data: artifact, error } = await db.from('ci_artifacts').select('*, build:ci_builds(project:ci_projects(repository_full_name))').eq('id', artifactId).maybeSingle()
  if (error) throw error
  if (!artifact?.external_artifact_id) throw new Error('Artifact not found or has no GitHub artifact ID')
  const build = Array.isArray(artifact.build) ? artifact.build[0] : artifact.build
  const project = Array.isArray(build?.project) ? build.project[0] : build?.project
  const { owner, repo } = repoParts(project?.repository_full_name)
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifact.external_artifact_id}/zip`, { method: 'GET', headers: githubHeaders(), redirect: 'manual' })
  const location = response.headers.get('location')
  if (![302, 307].includes(response.status) || !location) throw new Error(`GitHub artifact download returned ${response.status}`)
  return { url: location, expires_at: artifact.expires_at || null, name: artifact.name }
}

async function health(db: any) {
  const { data: projects, error } = await db.from('ci_projects').select('*').eq('enabled', true).order('created_at').limit(1)
  if (error) throw error
  const project = projects?.[0] || null
  if (!githubToken()) return { ok: true, github_configured: false, github_connected: false, enabled_projects: projects?.length || 0, github_error: 'GitHub token not configured' }
  if (!project) return { ok: true, github_configured: true, github_connected: false, enabled_projects: 0, github_error: 'No enabled CI/CD project' }
  try {
    const { owner, repo } = repoParts(project.repository_full_name)
    await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
    return { ok: true, github_configured: true, github_connected: true, enabled_projects: projects.length, github_error: null }
  } catch (error: any) {
    return { ok: true, github_configured: true, github_connected: false, enabled_projects: projects.length, github_error: error?.message || 'GitHub connection check failed' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { db, user } = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '').trim()
    if (action === 'health') return json(await health(db))
    if (action === 'dispatch') {
      if (!body?.project_id) return json({ error: 'project_id is required' }, 400)
      return json({ ok: true, build: await dispatch(db, user, String(body.project_id), body?.branch ? String(body.branch) : undefined) })
    }
    if (action === 'sync') {
      if (!body?.build_id) return json({ error: 'build_id is required' }, 400)
      return json({ ok: true, ...(await syncBuild(db, String(body.build_id))) })
    }
    if (action === 'artifact_link') {
      if (!body?.artifact_id) return json({ error: 'artifact_id is required' }, 400)
      return json({ ok: true, ...(await artifactLink(db, String(body.artifact_id))) })
    }
    return json({ error: 'Unsupported action' }, 400)
  } catch (error: any) {
    const message = error?.message || 'CI/CD request failed'
    return json({ error: message }, /Authorization|required|Invalid session|Admin access/.test(message) ? 401 : 500)
  }
})
