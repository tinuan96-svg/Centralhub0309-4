'use client';

import { useEffect } from 'react';
import { BankSyncService } from '@/lib/services/banking/bankSyncService';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 5 * 60 * 1000;

export default function BankingLiveSync() {
  useEffect(() => {
    let running = false;

    const sync = async (force = false) => {
      if (running) return;
      running = true;
      try {
        const accounts = await BankSyncService.getBankAccounts();
        const now = Date.now();
        const configured = accounts.filter((account) => {
          if (!account.is_active || !account.google_sheet_id || !account.store_id) return false;
          if (force || !account.last_synced_at) return true;
          const last = new Date(account.last_synced_at).getTime();
          return !Number.isFinite(last) || now - last >= STALE_AFTER_MS;
        });

        let changed = false;
        for (const account of configured) {
          const result = await BankSyncService.syncGoogleSheet(account.id);
          if (result.success) changed = true;
        }

        if (changed) window.location.reload();
      } catch (error) {
        console.error('Automatic bank sync failed:', error);
      } finally {
        running = false;
      }
    };

    // Sync immediately when the banking page opens if the Google Sheet has
    // never been synced or the existing sync is stale. Subsequent checks run
    // every five minutes without creating a reload loop.
    void sync();
    const timer = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
