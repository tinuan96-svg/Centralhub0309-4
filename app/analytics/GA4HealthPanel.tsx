'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/lib/design-system';
import { analyticsService } from '@/lib/services/analytics/analyticsService';

interface GA4HealthPanelProps { storeId?: string | null; }

type Config = {
  store_id: string;
  ga4_property_id?: string | null;
  ga4_measurement_id?: string | null;
  public_tracking_enabled?: boolean | null;
  realtime_enabled?: boolean | null;
  ecommerce_tracking_enabled?: boolean | null;
  last_ga4_sync_at?: string | null;
  last_error?: string | null;
  config?: Record<string, unknown> | null;
};

export default function GA4HealthPanel({ storeId }: GA4HealthPanelProps) {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await analyticsService.getConfigs(storeId || undefined);
      setConfigs(rows as Config[]);
    } catch (error) {
      console.error('[GA4Health] Failed to load configuration:', error);
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card className="p-6 bg-slate-900/40 border-slate-800 rounded-[2rem]">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-black text-white uppercase">GA4 Sync Health</h2>
          <p className="text-xs text-slate-500 mt-1">Store-scoped property, tracking and last synchronization state</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="text-xs text-slate-400 hover:text-white disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {configs.length === 0 && !loading ? (
        <p className="py-8 text-center text-sm text-slate-500">No GA4 configuration has been selected for this store yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {configs.map((config) => {
            const propertyName = String(config.config?.ga4_property_name || 'GA4 property not named');
            const healthy = Boolean(config.ga4_property_id) && !config.last_error;
            return (
              <div key={config.store_id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${healthy ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {healthy ? 'Configured' : 'Needs attention'}
                  </span>
                  <span className="text-[10px] text-slate-600">{config.store_id}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white truncate">{propertyName}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Property: {config.ga4_property_id || 'Not selected'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                  <span>Realtime: <b className="text-slate-300">{config.realtime_enabled ? 'ON' : 'OFF'}</b></span>
                  <span>Ecommerce: <b className="text-slate-300">{config.ecommerce_tracking_enabled ? 'ON' : 'OFF'}</b></span>
                  <span>Browser: <b className="text-slate-300">{config.public_tracking_enabled ? 'ON' : 'OFF'}</b></span>
                  <span>Measurement: <b className="text-slate-300">{config.ga4_measurement_id || '—'}</b></span>
                </div>
                <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">
                  Last sync: <span className="text-slate-300">{config.last_ga4_sync_at ? new Date(config.last_ga4_sync_at).toLocaleString() : 'Never'}</span>
                </p>
                {config.last_error && <p className="text-[10px] text-amber-300 border-t border-slate-800 pt-3">{config.last_error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
