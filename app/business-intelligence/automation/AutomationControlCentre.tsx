'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, StatGrid, StatCard, Button, Badge } from '@/lib/design-system';
import { supabase } from '@/lib/supabase';

export default function AutomationControlCentre() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any[]>([]);
  const [updating, setUpdating] = useState(false);
  const [settingError, setSettingError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logData, settingsData] = await Promise.all([
        supabase.from('automation_execution_log').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('system_intelligence_settings').select('*').filter('key', 'ilike', 'automation_%')
      ]);

      if (logData.error) throw logData.error;
      if (settingsData.error) throw settingsData.error;

      setLogs(logData.data || []);
      setSettings(settingsData.data || []);
      setSettingError(null);
    } catch (err) {
      console.error('Failed to load automation data:', err);
      setSettingError(err instanceof Error ? err.message : 'Failed to load automation control state.');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSetting = async (key: string, value: boolean) => {
    setUpdating(true);
    setSettingError(null);
    try {
      const { error } = await supabase
        .from('system_intelligence_settings')
        .upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) throw error;
      await loadData();
      return true;
    } catch (err) {
      console.error(`Failed to update automation setting ${key}:`, err);
      setSettingError(err instanceof Error ? err.message : `Failed to update ${key}.`);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const globalEnabled = settings.find(s => s.key === 'automation_global_enabled')?.value === true;
  const activeMode = settings.find(s => s.key === 'automation_mode_active')?.value === true;

  const requestGlobalToggle = async () => {
    if (!globalEnabled && activeMode) {
      const confirmed = window.confirm(
        'Automation is configured for ACTIVE mode. Resuming the global switch can allow live mutations and messages. Resume anyway?'
      );
      if (!confirmed) return;
    }
    await updateSetting('automation_global_enabled', !globalEnabled);
  };

  const requestModeToggle = async () => {
    if (!activeMode) {
      const confirmed = window.confirm(
        'Switch to ACTIVE mode? When the global switch is online, enabled modules may change live data or send messages. Use DRY RUN unless you intentionally want live execution.'
      );
      if (!confirmed) return;
    }
    await updateSetting('automation_mode_active', !activeMode);
  };

  const health = useMemo(() => {
    const total = logs.length;
    if (total === 0) return { status: 'NO EXECUTIONS YET', executions: 0, successful: 0, failed: 0, rate: '0.0' };

    const successful = logs.filter(l => l.status === 'executed' || l.status === 'dry_run_success').length;
    const failed = logs.filter(l => l.status === 'failed').length;
    const rate = (successful / (total - logs.filter(l => l.status === 'duplicate_prevented').length || 1)) * 100;

    let status = 'HEALTHY';
    if (rate < 80) status = 'WARNING';
    if (failed > 5) status = 'CRITICAL';

    return { status, executions: total, successful, failed, rate: rate.toFixed(1) };
  }, [logs]);

  const modules = [
    { key: 'automation_lifecycle_enabled', label: 'Lifecycle' },
    { key: 'automation_inventory_enabled', label: 'Inventory' },
    { key: 'automation_competitor_enabled', label: 'Competitor' },
    { key: 'automation_marketing_enabled', label: 'Marketing' },
    { key: 'automation_purchasing_enabled', label: 'Purchasing' },
    { key: 'automation_pricing_enabled', label: 'Pricing' },
    { key: 'automation_recovery_enabled', label: 'Recovery' },
    { key: 'automation_content_enabled', label: 'Content' },
  ];

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Automation Control Centre"
        subtitle="Manage safety policies, execution modes, and emergency kill-switches."
      />

      {settingError && (
        <Card className="p-4 border border-rose-500/30 bg-rose-500/10">
          <p className="text-sm font-bold text-rose-300">Automation control update failed</p>
          <p className="text-xs text-rose-200/70 mt-1">{settingError}</p>
        </Card>
      )}

      {loading && (
        <Card className="p-4 border border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-400">Loading the current automation safety state…</p>
        </Card>
      )}

      {/* Health Check Summary */}
      <Card className={`p-6 border-l-4 ${
        health.status === 'HEALTHY' ? 'border-l-emerald-500 bg-emerald-500/5' :
        health.status === 'WARNING' ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-rose-500 bg-rose-500/5'
      }`}>
        <div className="flex justify-between items-center">
           <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Dry Run Health Status</h3>
              <p className={`text-2xl font-black ${
                health.status === 'HEALTHY' ? 'text-emerald-400' :
                health.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'
              }`}>{health.status}</p>
           </div>
           <div className="text-right">
              <p className="text-[10px] text-slate-500 font-bold uppercase">Success Rate</p>
              <p className="text-xl font-bold text-white">{health.rate || '0.0'}%</p>
           </div>
        </div>
      </Card>

      {/* Primary Safety Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`p-6 border-2 transition-all ${globalEnabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
          <div className="flex justify-between items-center mb-4">
             <div>
                <h3 className={`text-lg font-bold ${globalEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {globalEnabled ? 'AUTOMATION IS ONLINE' : 'AUTOMATION STOPPED'}
                </h3>
                <p className="text-sm text-slate-400">Global kill switch state</p>
             </div>
             <Button
               onClick={() => void requestGlobalToggle()}
               variant={globalEnabled ? 'danger' : 'primary'}
               disabled={updating || loading}
               className="font-black uppercase"
             >
               {globalEnabled ? 'STOP ALL' : 'RESUME'}
             </Button>
          </div>
          <Badge variant={globalEnabled ? 'success' : 'danger'}>
             {globalEnabled ? 'GATE OPEN' : 'ALL BLOCKED'}
          </Badge>
        </Card>

        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="flex justify-between items-center mb-4">
             <div>
                <h3 className="text-lg font-bold text-blue-400">
                  {activeMode ? 'ACTIVE MODE' : 'DRY RUN MODE'}
                </h3>
                <p className="text-sm text-slate-400">Operational mutation setting</p>
             </div>
             <Button
               onClick={() => void requestModeToggle()}
               variant="secondary"
               disabled={updating || loading || !globalEnabled}
               className="text-[10px] font-black"
             >
               SWITCH TO {activeMode ? 'DRY RUN' : 'ACTIVE'}
             </Button>
          </div>
          <p className="text-xs text-slate-500 italic leading-relaxed">
            In DRY RUN mode, the engine evaluates rules and logs &quot;WOULD EXECUTE&quot; results without changing live product prices or sending messages.
          </p>
        </Card>
      </div>

      {/* Module Controls */}
      <Card className="p-6 bg-slate-900/50 border-slate-800">
         <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Module Level Controls</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modules.map(m => {
               const enabled = settings.find(s => s.key === m.key)?.value === true;
               return (
                  <div key={m.key} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 flex justify-between items-center">
                     <div>
                        <p className="text-sm font-bold text-slate-200">{m.label}</p>
                        <p className="text-[10px] text-slate-500">{enabled ? 'Enabled' : 'Disabled'}</p>
                     </div>
                     <button
                        onClick={() => void updateSetting(m.key, !enabled)}
                        disabled={updating || loading || !globalEnabled}
                        className={`w-10 h-5 rounded-full transition-colors relative ${enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                     >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${enabled ? 'right-1' : 'left-1'}`} />
                     </button>
                  </div>
               );
            })}
         </div>
      </Card>

      <StatGrid columns={4}>
         <StatCard label="Total Executions" value={health.executions.toString()} icon="📈" />
         <StatCard label="Policy Blocks" value={logs.filter(l => l.status === 'policy_blocked').length.toString()} icon="🛡️" />
         <StatCard label="Stale Data" value={logs.filter(l => l.status === 'stale').length.toString()} icon="⚠️" />
         <StatCard label="Duplicates" value={logs.filter(l => l.status === 'duplicate_prevented').length.toString()} icon="👯" />
      </StatGrid>

      {/* Execution Log */}
      <Card className="p-6 bg-slate-900/50 border-slate-800 overflow-hidden">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Recent Execution Log</h3>
        <div className="overflow-x-auto">
           <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                 <tr>
                    <th className="px-4 py-3">Action Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Idempotency Key</th>
                    <th className="px-4 py-3">Time</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                 {logs.map(log => (
                    <tr key={log.id} className="text-sm hover:bg-slate-800/30 transition-colors">
                       <td className="px-4 py-3 text-slate-200 font-medium">{String(log.action_type || 'unknown').replace(/_/g, ' ')}</td>
                       <td className="px-4 py-3">
                          <Badge variant={
                             log.status === 'executed' ? 'success' :
                             log.status === 'failed' ? 'danger' :
                             log.status === 'stale' ? 'warning' : 'info'
                          }>
                             {String(log.status || 'unknown').toUpperCase()}
                          </Badge>
                       </td>
                       <td className="px-4 py-3 text-[10px] font-mono text-slate-400 uppercase">{log.mode || '—'}</td>
                       <td className="px-4 py-3 text-xs text-slate-500 font-mono truncate max-w-[200px]">{log.idempotency_key || '—'}</td>
                       <td className="px-4 py-3 text-xs text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleTimeString() : '—'}</td>
                    </tr>
                 ))}
                 {logs.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-500 italic">No logs recorded yet.</td></tr>
                 )}
              </tbody>
           </table>
        </div>
      </Card>
    </div>
  );
}
