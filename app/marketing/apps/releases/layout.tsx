'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

const DISCOVERY_SESSION_KEY = 'centralhub_app_publishing_discovery_v1';
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const PUBLISHING_PROVIDERS = new Set(['google_play', 'app_store_connect']);

export default function AppReleaseDiscoveryLayout({ children }: { children: ReactNode }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const previous = Number(sessionStorage.getItem(DISCOVERY_SESSION_KEY) || '0');
    if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < DISCOVERY_TTL_MS) return;

    let cancelled = false;
    const discover = async () => {
      try {
        const { data, error } = await supabase
          .from('marketing_provider_configs')
          .select('store_id,provider_id')
          .in('provider_id', ['google_play', 'app_store_connect']);
        if (error) throw error;

        const targets = Array.from(
          new Map(
            (data || [])
              .filter(row => PUBLISHING_PROVIDERS.has(String(row.provider_id)))
              .map(row => [`${row.store_id}:${row.provider_id}`, row])
          ).values()
        );
        if (!targets.length || cancelled) return;

        const results = await Promise.allSettled(
          targets.map(target => supabase.functions.invoke('app-publishing-credential-discovery', {
            body: {
              storeId: target.store_id,
              providerId: target.provider_id,
            },
          }))
        );
        if (cancelled) return;

        sessionStorage.setItem(DISCOVERY_SESSION_KEY, String(Date.now()));
        const changed = results.some(result => result.status === 'fulfilled' && !result.value.error);
        if (changed) window.location.reload();
      } catch (error) {
        console.warn('App publishing credential discovery skipped:', error);
      }
    };

    void discover();
    return () => { cancelled = true; };
  }, []);

  return children;
}
