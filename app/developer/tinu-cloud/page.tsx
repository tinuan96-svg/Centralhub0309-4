'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    let alive = true;
    (async () => {
      const [projectRes, settingsRes] = await Promise.all([
        supabase.from('tinu_cloud_projects').select('*').order('name'),
        supabase.from('tinu_cloud_settings').select('*').eq('singleton', true).maybeSingle(),
      ]);
      if (!alive) return;
      if (!projectRes.error) setProjects((projectRes.data || []) as Project[]);
      if (!settingsRes.error) setSettings(settingsRes.data as Settings | null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const switches = [
    ['Source writes', settings?.source_writes_enabled],
    ['Deployments', settings?.deployments_enabled],
    ['Domain cutover', settings?.domain_cutover_enabled],
  ];

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
              <div className="mt-1 font-black capitalize text-amber-100">{settings?.stage || 'planning'}</div>
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
            <span className={"rounded-full border px-3 py-1 text-xs font-black " + pending}>{loading ? 'Loading…' : projects.length + ' registered'}</span>
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
