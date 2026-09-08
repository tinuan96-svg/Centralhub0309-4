'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const WATCH_KEY = 'centralhub-dhl-gmail-watch-bootstrap-v1';
const SCAN_KEY = 'centralhub-dhl-invoice-scan-v1';
const WATCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SCAN_INTERVAL_MS = 2 * 60 * 60 * 1000;

function due(key: string, interval: number) {
  try {
    const last = Number(localStorage.getItem(key) || 0);
    return !last || Date.now() - last >= interval;
  } catch {
    return true;
  }
}

function stamp(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch {}
}

/**
 * Quietly keeps the DHL invoice mailbox ingestion alive for the single-admin
 * CentralHub workspace. Gmail push-watch remains the realtime path; the
 * periodic scan is an idempotent safety net for missed/expired notifications.
 */
export default function DhlInvoiceAutoSync() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (cancelled || !auth.session) return;

      let scanned = false;

      if (due(WATCH_KEY, WATCH_INTERVAL_MS)) {
        const { data, error } = await supabase.functions.invoke('dhl-invoice-reconcile', {
          body: { action: 'setup_watch', days: 45 },
        });
        if (!error && data?.success !== false) {
          stamp(WATCH_KEY);
          stamp(SCAN_KEY); // setup_watch performs a recent scan as well
          scanned = true;
        } else {
          console.warn('[DHL invoice sync] Gmail watch bootstrap unavailable; using scan fallback.', error || data?.error);
        }
      }

      if (!scanned && due(SCAN_KEY, SCAN_INTERVAL_MS)) {
        const { data, error } = await supabase.functions.invoke('dhl-invoice-reconcile', {
          body: { action: 'scan_recent', days: 45 },
        });
        if (!error && data?.success !== false) stamp(SCAN_KEY);
        else console.warn('[DHL invoice sync] Recent invoice scan failed.', error || data?.error);
      }

      // Old partial imports are retried after shipment/order data has caught up.
      const { data: retry, error: retryError } = await supabase.functions.invoke('dhl-invoice-reconcile', {
        body: { action: 'retry_unmatched', limit: 250 },
      });
      if (retryError || retry?.success === false) {
        console.warn('[DHL invoice sync] Unmatched invoice retry failed.', retryError || retry?.error);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
