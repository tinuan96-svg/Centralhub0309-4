'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CENTRALHUB_DATA_MODE_EVENT,
  CENTRALHUB_DATA_MODE_STORAGE_KEY,
  CentralHubDataMode,
  getCentralHubDataMode,
  isDemoConfigured,
  setCentralHubDataMode,
} from '@/lib/demoMode';

export function useDemoMode() {
  const [mode, setMode] = useState<CentralHubDataMode>('live');

  useEffect(() => {
    const sync = () => setMode(getCentralHubDataMode());
    sync();
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === CENTRALHUB_DATA_MODE_STORAGE_KEY) sync();
    };
    window.addEventListener('storage', storage);
    window.addEventListener(CENTRALHUB_DATA_MODE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener(CENTRALHUB_DATA_MODE_EVENT, sync);
    };
  }, []);

  const switchTo = useCallback((next: CentralHubDataMode) => {
    setCentralHubDataMode(next);
    window.location.reload();
  }, []);

  return {
    mode,
    isDemo: mode === 'demo',
    configured: isDemoConfigured(),
    activateDemo: useCallback(() => switchTo('demo'), [switchTo]),
    activateLive: useCallback(() => switchTo('live'), [switchTo]),
  };
}
