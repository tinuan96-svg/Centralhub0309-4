'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  slug: string;
  repository_full_name: string;
  default_branch: string;
  workflow_file: string;
  platform: string;
  enabled: boolean;
  metadata?: Record<string, any>;
};

type Build = {
  id: string;
  project_id: string;
  external_run_id: number | null;
  external_run_number: number | null;
  workflow_name: string | null;
  branch: string;
  commit_sha: string | null;
  trigger_type: string;
  status: string;
  conclusion: string | null;
  run_url: string | null;
  version_name: string | null;
  version_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  project?: Project | Project[];
};

type Step = {
  id: string;
  build_id: string;
  external_job_id: number | null;
  external_step_number: number | null;
  job_name: string | null;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
};

type Artifact = {
  id: string;
  build_id: string;
  name: string;
  file_name: string | null;
  platform: string | null;
  kind: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  created_at: string;
};

type Health = {
  ok: boolean;
  github_configured: boolean;
  github_connected: boolean;
  enabled_projects: number;
  github_error?: string | null;
};

const terminalStatuses = new Set(['success', 'failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'stale']);
const statusTone: Record<string, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  in_progress: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  queued: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  requested: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  waiting: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  failure: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  timed_out: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

function StatusBadge({ value }: { value: string | null | undefined }) {
  const status = value || 'unknown';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone[status] || 'border-slate-700 bg-slate-800/70 text-slate-300'}`}>{status.replaceAll('_', ' ')}</span>;
}

function relative(value?: string | null) {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function duration(value?: number | null) {
  if (value == null) return '—';
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
}

function size(value?: number | null) {
  if (value == null) return '—';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function projectOf(build: Build) {
  return Array.isArray(build.project) ? build.project[0] : build.project;
}

export default function CiCdPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const [projectRes, buildRes] = await Promise.all([
      supabase.from('ci_projects').select('*').eq('enabled', true).order('name'),
      supabase.from('ci_builds').select('*, project:ci_projects(*)').order('created_at', { ascending: false }).limit(100),
    ]);
    const firstError = projectRes.error || buildRes.error;
    if (firstError) throw firstError;
    const nextProjects = (projectRes.data || []) as Project[];
    const nextBuilds = (buildRes.data || []) as Build[];
    setProjects(nextProjects);
    setBuilds(nextBuilds);
    setSelectedProjectId(prev => prev && nextProjects.some(p => p.id === prev) ? prev : (nextProjects[0]?.id || ''));
    setSelectedBuildId(prev => prev && nextBuilds.some(b => b.id === prev) ? prev : (nextBuilds[0]?.id || null));
    setLoading(false);
  }, []);

  const loadDetails = useCallback(async (buildId: string | null) => {
    if (!buildId) { setSteps([]); setArtifacts([]); return; }
    const [stepRes, artifactRes] = await Promise.all([
      supabase.from('ci_build_steps').select('*').eq('build_id', buildId).order('external_job_id').order('external_step_number'),
      supabase.from('ci_artifacts').select('*').eq('build_id', buildId).order('created_at', { ascending: false }),
    ]);
    const firstError = stepRes.error || artifactRes.error;
    if (firstError) throw firstError;
    setSteps((stepRes.data || []) as Step[]);
    setArtifacts((artifactRes.data || []) as Artifact[]);
  }, []);

  const loadHealth = useCallback(async () => {
    const { data, error: invokeError } = await supabase.functions.invoke('ci-build-manager', { body: { action: 'health' } });
    if (invokeError) throw invokeError;
    if (data?.error) throw new Error(data.error);
    setHealth(data as Health);
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadOverview(), loadHealth()]);
    } catch (e: any) {
      setError(e?.message || 'Unable to load CI/CD data.');
      setLoading(false);
    }
  }, [loadHealth, loadOverview]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);
  useEffect(() => { void loadDetails(selectedBuildId).catch((e: any) => setError(e?.message || 'Unable to load build details.')); }, [selectedBuildId, loadDetails]);

  useEffect(() => {
    const project = projects.find(item => item.id === selectedProjectId);
    if (project) setBranch(project.default_branch || 'main');
  }, [projects, selectedProjectId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadOverview().catch(() => undefined);
        if (selectedBuildId) void loadDetails(selectedBuildId).catch(() => undefined);
      }, 250);
    };
    let channel = supabase.channel(`ci-cd-live-${Math.random().toString(36).slice(2)}`);
    for (const table of ['ci_builds', 'ci_build_steps', 'ci_artifacts']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshSoon);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadDetails, loadOverview, selectedBuildId]);

  const syncBuild = useCallback(async (buildId: string, quiet = false) => {
    if (!quiet) setSyncing(buildId);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ci-build-manager', { body: { action: 'sync', build_id: buildId } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      await loadOverview();
      if (selectedBuildId === buildId) await loadDetails(buildId);
      return true;
    } catch (e: any) {
      if (!quiet) setError(e?.message || 'Build sync failed.');
      return false;
    } finally {
      if (!quiet) setSyncing(null);
    }
  }, [loadDetails, loadOverview, selectedBuildId]);

  useEffect(() => {
    if (!health?.github_connected) return;
    const active = builds.filter(build => !terminalStatuses.has(build.status)).slice(0, 4);
    if (!active.length) return;
    const timer = window.setInterval(() => {
      void (async () => {
        for (const build of active) await syncBuild(build.id, true);
      })();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [builds, health?.github_connected, syncBuild]);

  const runBuild = async () => {
    if (!selectedProjectId || dispatching) return;
    setDispatching(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ci-build-manager', {
        body: { action: 'dispatch', project_id: selectedProjectId, branch },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      const buildId = data?.build?.id as string | undefined;
      await loadOverview();
      if (buildId) {
        setSelectedBuildId(buildId);
        window.setTimeout(() => void syncBuild(buildId, true), 2500);
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to start build.');
    } finally {
      setDispatching(false);
    }
  };

  const downloadArtifact = async (artifactId: string) => {
    setDownloading(artifactId);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ci-build-manager', { body: { action: 'artifact_link', artifact_id: artifactId } });
      if (invokeError) throw invokeError;
      if (data?.error || !data?.url) throw new Error(data?.error || 'Artifact link was not returned.');
      window.location.assign(data.url);
    } catch (e: any) {
      setError(e?.message || 'Unable to download artifact.');
    } finally {
      setDownloading(null);
    }
  };

  const selectedBuild = builds.find(build => build.id === selectedBuildId) || null;
  const selectedProject = projects.find(project => project.id === selectedProjectId) || null;

  const stats = useMemo(() => {
    const last7d = builds.filter(build => Date.now() - new Date(build.created_at).getTime() < 7 * 86400000);
    const finished = last7d.filter(build => terminalStatuses.has(build.status));
    const successes = finished.filter(build => build.status === 'success').length;
    const durations = finished.map(build => build.duration_seconds).filter((value): value is number => typeof value === 'number');
    return {
      running: builds.filter(build => !terminalStatuses.has(build.status)).length,
      successRate: finished.length ? Math.round((successes / finished.length) * 100) : null,
      average: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      last7d: last7d.length,
    };
  }, [builds]);

  if (loading) {
    return <div className="min-h-screen bg-slate-950 p-6 text-slate-300"><div className="mx-auto max-w-7xl animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60 p-8">Loading CentralHub CI/CD…</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-5 p-3 sm:p-5 lg:p-7">
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                <span>Developer</span><span className="text-slate-600">/</span><span>CI/CD</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Build Control Plane</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">Run native builds, follow GitHub Actions step-by-step, capture artifacts and hand successful builds into the existing release system.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/developer/ci-cd/releases" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-slate-200 hover:border-slate-600 hover:bg-slate-800">Releases</Link>
              <button onClick={() => void refreshAll()} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-slate-200 hover:border-slate-600 hover:bg-slate-800">Refresh</button>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 lg:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">GitHub Actions connection</p><p className="mt-2 text-lg font-black">{health?.github_connected ? 'Connected' : 'Needs attention'}</p></div>
                <span className={`mt-1 h-3 w-3 rounded-full ${health?.github_connected ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.8)]' : 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,.6)]'}`} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{health?.github_connected ? 'Server-side GitHub credential verified. Token values never enter the browser.' : (health?.github_error || 'Checking connection…')}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Running</p><p className="mt-2 text-2xl font-black">{stats.running}</p><p className="text-xs text-slate-500">live builds</p></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">7d success</p><p className="mt-2 text-2xl font-black">{stats.successRate == null ? '—' : `${stats.successRate}%`}</p><p className="text-xs text-slate-500">{stats.last7d} builds</p></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Avg build</p><p className="mt-2 text-2xl font-black">{duration(stats.average)}</p><p className="text-xs text-slate-500">completed runs</p></div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-4">
              <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">New build</p><h2 className="mt-1 text-lg font-black">Run from CentralHub</h2></div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Project</label>
              <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-bold outline-none focus:border-cyan-500">
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <label className="mb-1 mt-4 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Branch</label>
              <input value={branch} onChange={e => setBranch(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-bold outline-none focus:border-cyan-500" />
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                <p className="font-bold text-slate-200">{selectedProject?.repository_full_name || 'No project selected'}</p>
                <p className="mt-1">Workflow: {selectedProject?.workflow_file || '—'}</p>
                <p>Platform: {selectedProject?.platform || '—'}</p>
              </div>
              <button onClick={() => void runBuild()} disabled={!selectedProjectId || !health?.github_connected || dispatching} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
                {dispatching ? 'Starting build…' : 'Run Build'}
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">A build record is created before GitHub is called, so failed dispatches are still visible and auditable.</p>
            </div>

            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Signing guardrail</p>
              <p className="mt-2 text-sm font-bold text-slate-200">Existing Android signing identity stays unchanged.</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">This milestone does not rotate or replace the installed-app key. The workflow still refuses an APK when its stored fingerprint does not match. Durable encrypted backup is the next signing-hardening step.</p>
            </div>
          </div>

          <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/65">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Build history</p><h2 className="mt-1 text-lg font-black">Recent runs</h2></div><span className="text-xs text-slate-500">Realtime</span></div>
            <div className="max-h-[650px] overflow-auto">
              {builds.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No CI/CD builds yet. Run the first build from the panel on the left.</div> : builds.map(build => {
                const project = projectOf(build);
                const active = build.id === selectedBuildId;
                return <button key={build.id} onClick={() => setSelectedBuildId(build.id)} className={`grid w-full gap-3 border-b border-slate-800/80 p-4 text-left transition hover:bg-slate-800/40 sm:grid-cols-[minmax(0,1fr)_120px_100px] ${active ? 'bg-cyan-500/[0.06]' : ''}`}>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{project?.name || build.workflow_name || 'Build'}</p><StatusBadge value={build.status} /></div><p className="mt-1 truncate text-xs text-slate-500">#{build.external_run_number || '—'} · {build.branch} · {build.commit_sha ? build.commit_sha.slice(0, 8) : 'commit pending'}</p>{build.error_message && <p className="mt-1 truncate text-xs text-rose-300">{build.error_message}</p>}</div>
                  <div className="text-xs text-slate-400"><p className="font-bold text-slate-300">{build.trigger_type}</p><p className="mt-1">{relative(build.created_at)}</p></div>
                  <div className="text-xs text-slate-400"><p className="font-bold text-slate-300">{duration(build.duration_seconds)}</p><p className="mt-1">{build.last_synced_at ? `sync ${relative(build.last_synced_at)}` : 'not synced'}</p></div>
                </button>;
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/65">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pipeline</p><h2 className="mt-1 text-lg font-black">{selectedBuild ? `Build #${selectedBuild.external_run_number || 'pending'}` : 'Select a build'}</h2></div>{selectedBuild && <div className="flex items-center gap-2">{selectedBuild.run_url && <a href={selectedBuild.run_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-black text-slate-300 hover:bg-slate-800">GitHub run</a>}<button onClick={() => void syncBuild(selectedBuild.id)} disabled={syncing === selectedBuild.id || !health?.github_connected} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-black text-cyan-300 disabled:opacity-40">{syncing === selectedBuild.id ? 'Syncing…' : 'Sync now'}</button></div>}</div>
            {!selectedBuild ? <div className="p-8 text-center text-sm text-slate-500">Choose a build above to inspect its stages.</div> : steps.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Waiting for GitHub job steps. Active builds sync automatically every few seconds.</div> : <div className="divide-y divide-slate-800/80">{steps.map(step => <div key={step.id} className="grid gap-3 p-4 sm:grid-cols-[36px_minmax(0,1fr)_110px] sm:items-center"><div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${statusTone[step.conclusion || step.status] || 'border-slate-700 bg-slate-800 text-slate-300'}`}>{step.conclusion === 'success' ? '✓' : step.conclusion === 'failure' ? '!' : step.status === 'in_progress' ? '●' : step.external_step_number || '•'}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-200">{step.name}</p><p className="truncate text-xs text-slate-500">{step.job_name || 'GitHub Actions job'}</p></div><div className="flex items-center justify-between gap-2 sm:block sm:text-right"><StatusBadge value={step.conclusion || step.status} /><p className="mt-1 text-xs text-slate-500">{duration(step.duration_seconds)}</p></div></div>)}</div>}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/65">
            <div className="border-b border-slate-800 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Artifacts</p><h2 className="mt-1 text-lg font-black">Build outputs</h2></div>
            <div className="p-4">
              {artifacts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Artifacts appear automatically after a completed GitHub Actions run.</p> : <div className="space-y-3">{artifacts.map(artifact => <div key={artifact.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{artifact.name}</p><p className="mt-1 text-xs text-slate-500">{artifact.platform || 'artifact'} · {size(artifact.size_bytes)}</p>{artifact.expires_at && <p className="mt-1 text-[11px] text-slate-600">Expires {new Date(artifact.expires_at).toLocaleDateString()}</p>}</div><button onClick={() => void downloadArtifact(artifact.id)} disabled={downloading === artifact.id || !health?.github_connected} className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-black text-cyan-300 disabled:opacity-40">{downloading === artifact.id ? 'Opening…' : 'Download'}</button></div></div>)}</div>}
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><p className="text-xs font-bold text-slate-300">Release hand-off</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">The existing App Release Manager is reused rather than duplicated. Automatic AAB/IPA hand-off will be enabled after the native release-build and signing path is verified.</p><Link href="/developer/ci-cd/releases" className="mt-3 inline-flex text-xs font-black text-cyan-300 hover:text-cyan-200">Open App Release Manager →</Link></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
