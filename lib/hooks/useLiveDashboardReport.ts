'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardReport, loadDashboardReport } from '@/lib/dashboard/reporting';
import { createRefreshQueue } from '@/lib/dashboard/refreshQueue';
import { useDashboardRealtime } from '@/lib/hooks/useDashboardRealtime';

export type { DashboardConnection } from '@/lib/hooks/useDashboardRealtime';
type Filters = Parameters<typeof loadDashboardReport>[0];

export function useLiveDashboardReport(filters: Filters, externalRefresh: number) {
  const { timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate } = filters;
  const [report, setReport] = useState<DashboardReport | null>(null);
  const scopeKey = JSON.stringify([timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate]);
  const [loadedScope, setLoadedScope] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<(delay?: number) => void>(() => {});
  const refresh = useCallback(() => requestRef.current(0), []);
  const changed = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    let disposed = false;
    const enabled = () => navigator.onLine && document.visibilityState !== 'hidden';
    setReport(null); setError(null); setLoading(true);
    const queue = createRefreshQueue(async () => {
      if (disposed) return;
      setLoading(true);
      try {
        const data = await loadDashboardReport({ timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate });
        if (!disposed) { setReport(data); setLoadedScope(JSON.stringify([timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate])); setError(null); }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'The report could not be updated.');
      } finally { if (!disposed) setLoading(false); }
    }, { enabled });
    requestRef.current = queue.request;
    queue.request(0);
    return () => {
      disposed = true; queue.dispose(); requestRef.current = () => {};
    };
  }, [timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate]);
  useEffect(() => { refresh(); }, [externalRefresh, refresh]);
  const connection = useDashboardRealtime(changed);
  return { report: loadedScope === scopeKey ? report : null, loading, error, connection, refresh };
}
