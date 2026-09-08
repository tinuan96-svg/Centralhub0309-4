/**
 * Canonical browser entry point for CentralHub order ingestion.
 *
 * IMPORTANT:
 * - Browser code must call this client, never sync-orders directly.
 * - The private sync secret stays in /api/sync-orders on the server.
 * - In-flight requests are shared to prevent duplicate full-sync calls and
 *   duplicate order-received notifications when multiple layout components mount.
 */

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
  [key: string]: unknown;
};

const inFlight = new Map<string, Promise<OrderSyncResponse>>();

function normalizeRequest(request: OrderSyncRequest): OrderSyncRequest {
  return {
    orderId: request.orderId?.trim() || undefined,
    storeSlug: request.storeSlug?.trim().toLowerCase() || undefined,
  };
}

function getFailureMessage(payload: Partial<OrderSyncResponse>, status: number): string {
  if (payload.error) return payload.error;
  if (payload.failures?.length) {
    return payload.failures.map((failure) => `${failure.store}: ${failure.error}`).join('; ');
  }
  return `Order sync request failed (HTTP ${status})`;
}

async function runOrderSync(request: OrderSyncRequest): Promise<OrderSyncResponse> {
  const response = await fetch('/api/sync-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: 'The order-sync service returned an unreadable response.',
  })) as OrderSyncResponse;

  if (!response.ok) {
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
