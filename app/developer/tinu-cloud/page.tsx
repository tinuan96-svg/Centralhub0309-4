'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

type Project = {
  id: string;
  name: string;
  slug: string;
  production_domain: string;
  current_host: string;
  target_host: string;
  migration_status: string;
  live_actions_enabled: boolean;
};

type Settings = {
  stage: string;
  source_writes_enabled: boolean;
  deployments_enabled: boolean;
  domain_cutover_enabled: boolean;
};

const off = 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
const pending = 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200';

export default function TinuCloudPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin, isLoading: authLoading, session } = useAuth();

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    const controller = new AbortController();
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!session?.access_token) throw new Error('A valid admin session is required.');
        const response = await fetch('/api/tinu-cloud/overview', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 403 ? 'Admin access required.' : 'Unable to load Tinu Cloud.');
        const data = await response.json();
        if (data.success !== true || !data.settings || !Array.isArray(data.projects)) throw new Error('Tinu Cloud is not ready.');
        if (!alive) return;
        setProjects(data.projects as Project[]);
        setSettings(data.settings as Settings);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Unable to load Tinu Cloud.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; controller.abort(); };
  }, [authLoading, isAdmin, session?.access_token]);

  const switches = [
    ['Source writes', settings?.source_writes_enabled],
    ['Deployments', settings?.deployments_enabled],
    ['Domain cutover', settings?.domain_cutover_enabled],
  ];

  if (authLoading) return <main className="min-h-screen bg-[#030712] p-6 text-slate-300">Checking your session…</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#030712] p-6 text-slate-300"><h1 className="text-xl font-black">Access restricted</h1><p className="mt-2 text-sm">Tinu Cloud is available to CentralHub administrators only.</p></main>;
  if (loading || error || !settings) return <main className="min-h-screen bg-[#030712] p-6 text-slate-300" role="status">
    <h1 className="text-xl font-black">Tinu Cloud</h1><p className="mt-2 text-sm">{loading ? 'Loading secure project registry…' : error || 'Tinu Cloud is not configured.'}</p>
  </main>;

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.16),transparent_35%),linear-gradient(135deg,rgba(15,23,42,.96),rgba(2,6,23,.98))] p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.28em] text-cyan-300">CentralHub Developer Centre</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Tinu Cloud</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">Self-hosting migration control plane. Preparation only: current production hosting remains untouched.</p>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-right">
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Migration stage</div>
              <div className="mt-1 font-black capitalize text-amber-100">{settings.stage}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {switches.map(([label, enabled]) => (
            <div key={String(label)} className={"rounded-2xl border p-4 " + (enabled ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : off)}>
              <div className="text-xs font-bold uppercase tracking-[.18em] opacity-70">{label}</div>
              <div className="mt-2 text-xl font-black">{enabled ? 'ENABLED' : 'LOCKED OFF'}</div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Migration registry</p>
              <h2 className="mt-1 text-xl font-black">Managed projects</h2>
            </div>
            <span className={"rounded-full border px-3 py-1 text-xs font-black " + pending}>{projects.length + ' registered'}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map(project => (
              <article key={project.id} className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{project.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">{project.production_domain}</p>
                  </div>
                  <span className={"rounded-full border px-2 py-1 text-[10px] font-black uppercase " + off}>Safe</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-slate-500">Current host</dt><dd className="mt-1 font-bold capitalize">{project.current_host}</dd></div>
                  <div><dt className="text-slate-500">Target</dt><dd className="mt-1 font-bold capitalize">{project.target_host.replaceAll('_',' ')}</dd></div>
                  <div><dt className="text-slate-500">Migration</dt><dd className="mt-1 font-bold capitalize">{project.migration_status.replaceAll('_',' ')}</dd></div>
                  <div><dt className="text-slate-500">Live actions</dt><dd className="mt-1 font-bold">{project.live_actions_enabled ? 'Enabled' : 'Disabled'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          {[
            ['01','Infrastructure','Server inventory, runtime and resource health.'],
            ['02','Source Control','Future self-hosted Git repositories and mirrors.'],
            ['03','Deployments','Build, release, rollback and approval pipeline.'],
            ['04','Domains & SSL','DNS, certificates and cutover readiness.'],
          ].map(([n,title,copy]) => (
            <div key={n} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <span className="text-xs font-black text-cyan-400">{n}</span>
              <h3 className="mt-2 font-black">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{copy}</p>
              <div className="mt-4 text-[10px] font-black uppercase tracking-[.18em] text-slate-600">Not connected yet</div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
