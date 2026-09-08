'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SecurityPulse from '@/app/dashboard/components/SecurityPulse';

type Store = { id: string; name: string; slug: string; domain: string | null };
type Config = {
  store_id: string;
  domain: string;
  github_repo: string | null;
  production_branch: string;
  deploy_provider: string;
  siteguru_enabled: boolean;
  search_console_enabled: boolean;
  master_enabled: boolean;
  execution_mode: 'disabled' | 'observe' | 'guarded' | 'autonomous';
  auto_fix_enabled: boolean;
  auto_merge_low_risk: boolean;
  auto_deploy: boolean;
  verify_after_deploy: boolean;
  rollback_on_regression: boolean;
  kill_switch: boolean;
  last_webhook_at: string | null;
  last_audit_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
};
type Issue = {
  id: string;
  store_id: string;
  check_name: string;
  title: string;
  severity: string;
  risk_level: string;
  affected_pages: number | null;
  status: string;
  report_url: string | null;
  last_seen_at: string;
};
type Run = { id: string; store_id: string; source: string; status: string; health_score: number | null; received_at: string };
type Attempt = { id: string; issue_id: string; status: string; repository: string; commit_sha: string | null; started_at: string; completed_at: string | null };

type StoreView = { store: Store; config: Config | null; issues: Issue[]; runs: Run[] };

const badgeClass: Record<string, string> = {
  resolved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  verified: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  queued: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  fixing: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  verifying: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  blocked: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  failed: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  open: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${badgeClass[value] || badgeClass.open}`}>{value}</span>;
}

function relativeDate(value: string | null | undefined) {
  if (!value) return 'Never';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SiteHealthPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [storeRes, configRes, issueRes, runRes, attemptRes] = await Promise.all([
      supabase.from('stores').select('id,name,slug,domain').order('name'),
      supabase.from('site_health_store_configs').select('*').order('updated_at', { ascending: false }),
      supabase.from('site_health_issues').select('id,store_id,check_name,title,severity,risk_level,affected_pages,status,report_url,last_seen_at').order('last_seen_at', { ascending: false }).limit(100),
      supabase.from('site_health_runs').select('id,store_id,source,status,health_score,received_at').order('received_at', { ascending: false }).limit(50),
      supabase.from('site_health_fix_attempts').select('id,issue_id,status,repository,commit_sha,started_at,completed_at').order('started_at', { ascending: false }).limit(30),
    ]);

    const firstError = storeRes.error || configRes.error || issueRes.error || runRes.error || attemptRes.error;
    if (firstError) {
      setError(firstError.message || 'Unable to load Site Health data.');
      setLoading(false);
      return;
    }
    setStores((storeRes.data || []) as Store[]);
    setConfigs((configRes.data || []) as Config[]);
    setIssues((issueRes.data || []) as Issue[]);
    setRuns((runRes.data || []) as Run[]);
    setAttempts((attemptRes.data || []) as Attempt[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 350); };
    let channel = supabase.channel(`site-health-live-${Math.random().toString(36).slice(2)}`);
    for (const table of ['site_health_store_configs', 'site_health_issues', 'site_health_runs', 'site_health_fix_attempts', 'security_heartbeats', 'security_events']) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshSoon);
    channel.subscribe();
    const fallback = window.setInterval(() => void load(), 60000);
    return () => { if (timer) clearTimeout(timer); window.clearInterval(fallback); void supabase.removeChannel(channel); };
  }, [load]);

  const views = useMemo<StoreView[]>(() => stores.map((store) => ({
    store,
    config: configs.find((config) => config.store_id === store.id) || null,
    issues: issues.filter((issue) => issue.store_id === store.id),
    runs: runs.filter((run) => run.store_id === store.id),
  })), [stores, configs, issues, runs]);

  const stats = useMemo(() => ({
    open: issues.filter((issue) => ['open', 'queued', 'fixing', 'verifying'].includes(issue.status)).length,
    queued: issues.filter((issue) => issue.status === 'queued').length,
    blocked: issues.filter((issue) => issue.status === 'blocked').length,
    failed: issues.filter((issue) => issue.status === 'failed').length,
  }), [issues]);

  const updateConfig = async (storeId: string, patch: Partial<Config>) => {
    setSavingStore(storeId);
    setError(null);
    const { error: updateError } = await supabase.from('site_health_store_configs').update({ ...patch, updated_at: new Date().toISOString() }).eq('store_id', storeId);
    if (updateError) setError(updateError.message);
    await load();
    setSavingStore(null);
  };

  if (loading) return <div className="p-5 md:p-8 text-slate-400">Loading Auto Site Health…</div>;

  return (
    <div className="p-4 md:p-8 space-y-6 min-w-0">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 md:p-7 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-400">CentralHub Automation</div>
            <h1 className="mt-2 text-2xl md:text-3xl font-black text-white">Security & Site Health</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Live availability, TLS and browser-security telemetry is combined with store-isolated SiteGuru and Search Console findings. Risky repairs remain constrained, validated in GitHub and deployed only after the production build passes.</p>
          </div>
          <button onClick={load} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">Refresh</button>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      </section>

      <SecurityPulse />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Active issues', stats.open, 'text-cyan-300'],
          ['Queued', stats.queued, 'text-blue-300'],
          ['Blocked / review', stats.blocked, 'text-amber-300'],
          ['Failed', stats.failed, 'text-rose-300'],
        ].map(([label, value, tone]) => <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div><div className={`mt-2 text-2xl font-black ${tone}`}>{value}</div></div>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {views.map(({ store, config, issues: storeIssues, runs: storeRuns }) => {
          const latestRun = storeRuns[0];
          const active = storeIssues.filter((issue) => !['resolved', 'ignored'].includes(issue.status));
          const enabled = Boolean(config?.master_enabled && !config?.kill_switch && config?.execution_mode !== 'disabled');
          return (
            <article key={store.id} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-white">{store.name}</h2><span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} /></div>
                  <div className="mt-1 truncate text-xs text-slate-500">{config?.domain || store.domain || 'No domain'} · {config?.github_repo || 'Repository not configured'}</div>
                </div>
                {latestRun?.health_score != null && <div className="text-right"><div className="text-2xl font-black text-white">{latestRun.health_score}</div><div className="text-[9px] uppercase tracking-widest text-slate-600">Health</div></div>}
              </div>

              {!config ? <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Site Health has not been configured for this store.</div> : <>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-950/60 p-3"><div className="text-slate-600">SiteGuru</div><div className={config.siteguru_enabled ? 'text-emerald-300 font-bold' : 'text-slate-500'}>{config.siteguru_enabled ? 'Connected' : 'Off'}</div></div>
                  <div className="rounded-xl bg-slate-950/60 p-3"><div className="text-slate-600">Search Console</div><div className={config.search_console_enabled ? 'text-emerald-300 font-bold' : 'text-slate-500'}>{config.search_console_enabled ? 'Connected' : 'Off'}</div></div>
                  <div className="rounded-xl bg-slate-950/60 p-3"><div className="text-slate-600">Last audit</div><div className="font-bold text-slate-300">{relativeDate(config.last_audit_at)}</div></div>
                  <div className="rounded-xl bg-slate-950/60 p-3"><div className="text-slate-600">Webhook</div><div className="font-bold text-slate-300">{config.last_webhook_at ? relativeDate(config.last_webhook_at) : 'Awaiting event'}</div></div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="text-xs text-slate-400">Execution mode
                    <select disabled={savingStore === store.id} value={config.execution_mode} onChange={(event) => updateConfig(store.id, { execution_mode: event.target.value as Config['execution_mode'] })} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none">
                      <option value="disabled">Disabled</option><option value="observe">Observe only</option><option value="guarded">Guarded auto-fix</option><option value="autonomous">Autonomous</option>
                    </select>
                  </label>
                  <button disabled={savingStore === store.id} onClick={() => updateConfig(store.id, { kill_switch: !config.kill_switch })} className={`rounded-xl border px-4 py-2 text-xs font-black ${config.kill_switch ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>{config.kill_switch ? 'Resume automation' : 'Kill switch'}</button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                  <span className={`rounded-full border px-2 py-1 ${config.auto_fix_enabled ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>AI fixes {config.auto_fix_enabled ? 'ON' : 'OFF'}</span>
                  <span className={`rounded-full border px-2 py-1 ${config.auto_merge_low_risk ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Low-risk merge {config.auto_merge_low_risk ? 'ON' : 'OFF'}</span>
                  <span className={`rounded-full border px-2 py-1 ${config.auto_deploy ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Deploy {config.auto_deploy ? 'ON' : 'OFF'}</span>
                  <span className={`rounded-full border px-2 py-1 ${config.rollback_on_regression ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Rollback guard {config.rollback_on_regression ? 'ON' : 'OFF'}</span>
                </div>

                <div className="mt-5 border-t border-slate-800 pt-4">
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Current issues</h3><span className="text-xs text-slate-600">{active.length}</span></div>
                  <div className="space-y-2">
                    {active.slice(0, 5).map((issue) => <div key={issue.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-bold text-slate-200">{issue.title}</div><div className="mt-1 text-[10px] text-slate-600">{issue.check_name} · risk {issue.risk_level}{issue.affected_pages ? ` · ${issue.affected_pages} pages` : ''}</div></div><Badge value={issue.status} /></div>
                      {issue.report_url && <a href={issue.report_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-bold text-cyan-400 hover:text-cyan-300">Open SiteGuru report ↗</a>}
                    </div>)}
                    {!active.length && <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-600">No active issues have been ingested yet.</div>}
                  </div>
                </div>
              </>}
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-white">Latest repair attempts</h2><p className="mt-1 text-xs text-slate-500">AI generation, validation and merge audit trail.</p></div><span className="text-[10px] text-slate-600">{attempts.length} recent</span></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[10px] uppercase tracking-widest text-slate-600"><tr><th className="pb-3">Repository</th><th className="pb-3">Status</th><th className="pb-3">Commit</th><th className="pb-3">Started</th></tr></thead><tbody className="divide-y divide-slate-800">{attempts.slice(0, 12).map((attempt) => <tr key={attempt.id}><td className="py-3 text-slate-300">{attempt.repository}</td><td className="py-3"><Badge value={attempt.status} /></td><td className="py-3 font-mono text-slate-500">{attempt.commit_sha?.slice(0, 10) || '—'}</td><td className="py-3 text-slate-500">{relativeDate(attempt.started_at)}</td></tr>)}{!attempts.length && <tr><td colSpan={4} className="py-6 text-center text-slate-600">No repair attempts yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
