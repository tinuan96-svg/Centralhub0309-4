/**
 * Canonical browser entry point for CentralHub order ingestion.
 *
 * IMPORTANT:
 * - Browser code must call this client, never sync-orders directly.
 * - The private sync secret stays in /api/sync-orders on the server.
 * - In-flight requests are shared to prevent duplicate full-sync calls and
 *   duplicate order-received notifications when multiple layout components mount.
 */

import { supabase } from '@/lib/supabase';

export type OrderSyncRequest = {
  orderId?: string;
  storeSlug?: string;
};

export type OrderSyncFailure = {
  store: string;
  error: string;
};

export type OrderSyncResponse = {
  success: boolean;
  partial_success?: boolean;
  targeted?: boolean;
  order_id?: string | null;
  store_slug?: string | null;
  imported?: number;
  items_synced?: number;
  mismatched_count?: number;
  stores?: Array<Record<string, unknown>>;
  failures?: OrderSyncFailure[];
  warnings?: Array<Record<string, unknown>>;
  message?: string;
  error?: string;
  gateway_recovered?: boolean;
  verified_store_slugs?: string[];
  [key: string]: unknown;
};

type SyncStatusResponse = {
  success: boolean;
  stores?: Record<string, { last_synced_at: string | null }>;
  error?: string;
};

const inFlight = new Map<string, Promise<OrderSyncResponse>>();
const ALL_STORE_SLUGS = ['malluspices', 'pocketgrocery', 'keralagrocery', 'tamilretail'];

function normalizeSlug(value?: string | null) {
  const slug = value?.trim().toLowerCase() || undefined;
  if (slug === 'keralagroceries') return 'keralagrocery';
  if (slug === 'tamilretail.com') return 'tamilretail';
  return slug;
}

function normalizeRequest(request: OrderSyncRequest): OrderSyncRequest {
  return {
    orderId: request.orderId?.trim() || undefined,
    storeSlug: normalizeSlug(request.storeSlug),
  };
}

function getFailureMessage(payload: Partial<OrderSyncResponse>, status: number): string {
  if (payload.error) return payload.error;
  if (payload.failures?.length) {
    return payload.failures.map((failure) => `${failure.store}: ${failure.error}`).join('; ');
  }
  return `Order sync request failed (HTTP ${status})`;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token || null;
}

async function readSyncStatus(): Promise<SyncStatusResponse | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const response = await fetch('/api/sync-orders/status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) return null;
  return await response.json().catch(() => null) as SyncStatusResponse | null;
}

async function verifySyncReachedCentralHub(request: OrderSyncRequest, startedAtMs: number) {
  const expectedStores = request.storeSlug ? [normalizeSlug(request.storeSlug)!] : ALL_STORE_SLUGS;
  const recentThreshold = startedAtMs - 2_000;

  // The upstream Edge Function may finish after Netlify has already replaced the
  // proxy response with an HTML 5xx page. Give CentralHub a short window to prove
  // that the requested store rows were actually refreshed before reporting failure.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await readSyncStatus();
    if (status?.success && status.stores) {
      const verified = expectedStores.filter((slug) => {
        const value = status.stores?.[slug]?.last_synced_at;
        if (!value) return false;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) && timestamp >= recentThreshold;
      });

      if (verified.length === expectedStores.length) {
        return verified;
      }
    }

    if (attempt < 5) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_000 + attempt * 500));
    }
  }

  return null;
}

function recoveredResponse(request: OrderSyncRequest, verifiedStores: string[]): OrderSyncResponse {
  return {
    success: true,
    targeted: Boolean(request.orderId || request.storeSlug),
    order_id: request.orderId || null,
    store_slug: request.storeSlug || null,
    gateway_recovered: true,
    verified_store_slugs: verifiedStores,
    message: `Sync completed in CentralHub for ${verifiedStores.join(', ')}. The web gateway response was interrupted after the database update, so CentralHub verified the result directly.`,
  };
}

async function runOrderSync(request: OrderSyncRequest): Promise<OrderSyncResponse> {
  const startedAtMs = Date.now();
  let response: Response;

  try {
    response = await fetch('/api/sync-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
    });
  } catch (error) {
    const verifiedStores = await verifySyncReachedCentralHub(request, startedAtMs);
    if (verifiedStores) return recoveredResponse(request, verifiedStores);
    throw error;
  }

  const raw = await response.text();
  let payload: OrderSyncResponse | null = null;
  try {
    payload = raw ? JSON.parse(raw) as OrderSyncResponse : null;
  } catch {
    payload = null;
  }

  if (!payload) {
    const verifiedStores = await verifySyncReachedCentralHub(request, startedAtMs);
    if (verifiedStores) return recoveredResponse(request, verifiedStores);

    const contentType = response.headers.get('content-type') || 'unknown content type';
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(
      `Order sync gateway returned an unreadable response (HTTP ${response.status}, ${contentType})${preview ? `: ${preview}` : '.'}`,
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      const verifiedStores = await verifySyncReachedCentralHub(request, startedAtMs);
      if (verifiedStores) return recoveredResponse(request, verifiedStores);
    }
    throw new Error(getFailureMessage(payload, response.status));
  }

  return payload;
}

export function syncOrders(request: OrderSyncRequest = {}): Promise<OrderSyncResponse> {
  const normalized = normalizeRequest(request);
  const key = JSON.stringify(normalized);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = runOrderSync(normalized);
  inFlight.set(key, promise);

  void promise.finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }).catch(() => {
    // The original promise carries the error to its caller.
  });

  return promise;
}
