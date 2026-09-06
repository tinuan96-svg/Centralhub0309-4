import { analyticsService } from './analyticsService';
import { classifyCurrentVisit, persistAttribution, getStoredAttribution } from './attribution';
import { initStoreAnalytics, trackStoreEvent } from './storeTracking';

export type StoreAnalyticsRuntime = {
  storeId: string;
  measurementId?: string | null;
  enabled?: boolean;
};

let runtime: StoreAnalyticsRuntime | null = null;
let sessionStarted = false;
let heartbeatTimer: number | null = null;
let visibilityHandler: (() => void) | null = null;

function stopHeartbeat() {
  if (typeof window === 'undefined') return;
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (visibilityHandler) window.removeEventListener('visibilitychange', visibilityHandler);
  visibilityHandler = null;
}

function sendHeartbeat() {
  if (!runtime || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'session_heartbeat', {
    store_id: runtime.storeId,
    page_location: window.location.href,
    page_title: document.title,
  });
}

function startHeartbeat() {
  if (typeof window === 'undefined') return;
  stopHeartbeat();
  sendHeartbeat();
  heartbeatTimer = window.setInterval(sendHeartbeat, 60_000);
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') sendHeartbeat();
  };
  window.addEventListener('visibilitychange', visibilityHandler);
}

export function configureAnalytics(next: StoreAnalyticsRuntime) {
  const changedStore = runtime?.storeId !== next.storeId || runtime?.measurementId !== next.measurementId;
  runtime = next;
  initStoreAnalytics({ measurementId: next.measurementId, enabled: next.enabled });
  const attribution = classifyCurrentVisit();
  persistAttribution(attribution);

  if (changedStore) {
    sessionStarted = false;
    stopHeartbeat();
  }

  if (!sessionStarted) {
    sessionStarted = true;
    trackStoreEvent({ measurementId: next.measurementId, enabled: next.enabled }, 'session_start', {
      store_id: next.storeId,
      first_touch_source: getStoredAttribution().firstTouch?.source,
      first_touch_medium: getStoredAttribution().firstTouch?.medium,
    });
  }

  startHeartbeat();
}

export function trackPage() {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'page_view', {
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  });
}

export function trackSearch(searchTerm: string) {
  if (!runtime || !searchTerm.trim()) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'search', { search_term: searchTerm.trim() });
}

export function trackBeginCheckout(value: number, currency = 'GBP', items: unknown[] = []) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'begin_checkout', { value, currency, items });
}

export function trackAddPaymentInfo(value: number, currency = 'GBP', paymentType?: string, items: unknown[] = []) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'add_payment_info', {
    value, currency, payment_type: paymentType, items,
  });
}

export function trackViewCart(value: number, currency = 'GBP', items: unknown[] = []) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'view_cart', { value, currency, items });
}

export function trackRemoveFromCart(value: number, currency = 'GBP', items: unknown[] = []) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, 'remove_from_cart', { value, currency, items });
}

export function trackPromotion(eventName: 'view_promotion' | 'select_promotion', promotion: Record<string, unknown>) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, eventName, promotion);
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!runtime) return;
  trackStoreEvent({ measurementId: runtime.measurementId, enabled: runtime.enabled }, name, params);
}

export async function recordCentralHubEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!runtime?.storeId) return;
  const { data, error } = await analyticsService.recordEvent({
    store_id: runtime.storeId,
    event_name: eventName,
    ...params,
  });
  if (error) throw error;
  return data;
}
