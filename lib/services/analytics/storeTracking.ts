/**
 * Privacy-safe, store-isolated browser analytics helpers.
 *
 * The default keeps existing tracking behaviour intact. Store frontends can
 * explicitly pass consentGranted=false before consent and call
 * setGoogleAnalyticsConsent(true) after the visitor accepts analytics.
 */

export type TrackingConfig = {
  measurementId?: string | null;
  enabled?: boolean;
  consentGranted?: boolean;
};

const SESSION_KEY = 'ch_analytics_session';
const GA4_SESSION_KEY = 'ch_ga4_session_id';
const ATTRIBUTION_KEY = 'ch_analytics_attribution';

function getOrCreateId(key: string): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function getOrCreateGa4SessionId(): number {
  if (typeof window === 'undefined') return 0;
  const existing = Number(window.sessionStorage.getItem(GA4_SESSION_KEY) || 0);
  if (Number.isSafeInteger(existing) && existing > 0) return existing;
  const id = Math.floor(Date.now() / 1000);
  window.sessionStorage.setItem(GA4_SESSION_KEY, String(id));
  return id;
}

function readAttribution() {
  if (typeof window === 'undefined') return {};
  const url = new URL(window.location.href);
  const params = url.searchParams;
  let stored: Record<string, string | undefined> = {};
  try { stored = JSON.parse(window.localStorage.getItem(ATTRIBUTION_KEY) || '{}'); } catch { stored = {}; }
  const current = {
    source: params.get('utm_source') || stored.source || undefined,
    medium: params.get('utm_medium') || stored.medium || undefined,
    campaign: params.get('utm_campaign') || stored.campaign || undefined,
    campaign_id: params.get('utm_id') || stored.campaign_id || undefined,
    content: params.get('utm_content') || stored.content || undefined,
    term: params.get('utm_term') || stored.term || undefined,
    gclid: params.get('gclid') || stored.gclid || undefined,
    gbraid: params.get('gbraid') || stored.gbraid || undefined,
    wbraid: params.get('wbraid') || stored.wbraid || undefined,
    fbclid: params.get('fbclid') || stored.fbclid || undefined,
    ttclid: params.get('ttclid') || stored.ttclid || undefined,
    referrer: document.referrer || stored.referrer || undefined,
  };
  window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
  return current;
}

function loadGtag(measurementId: string) {
  if (typeof window === 'undefined' || !measurementId) return;
  if (window.__centralHubGtagLoaded === measurementId) return;
  const scriptId = `ch-ga4-${measurementId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: unknown[]) { window.dataLayer!.push(args); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { anonymize_ip: true, send_page_view: false });
  window.__centralHubGtagLoaded = measurementId;
}

export function setGoogleAnalyticsConsent(granted: boolean) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: unknown[]) { window.dataLayer!.push(args); };
  window.gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
  });
  window.localStorage.setItem('ch_ga4_consent', granted ? 'granted' : 'denied');
}

export function initGoogleConsentMode(defaultGranted = false) {
  if (typeof window === 'undefined') return;
  const granted = window.localStorage.getItem('ch_ga4_consent') === 'granted';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: unknown[]) { window.dataLayer!.push(args); };
  const allow = granted || defaultGranted;
  window.gtag('consent', 'default', {
    analytics_storage: allow ? 'granted' : 'denied',
    ad_storage: allow ? 'granted' : 'denied',
    ad_user_data: allow ? 'granted' : 'denied',
    ad_personalization: allow ? 'granted' : 'denied',
    wait_for_update: 500,
  });
}

export function initStoreAnalytics(config: TrackingConfig) {
  if (typeof window === 'undefined' || config.enabled === false || !config.measurementId || config.consentGranted === false) return;
  loadGtag(config.measurementId);
  getOrCreateId(SESSION_KEY);
  getOrCreateGa4SessionId();
  readAttribution();
}

export function trackStoreEvent(config: TrackingConfig, eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || config.enabled === false || !config.measurementId || config.consentGranted === false) return;
  loadGtag(config.measurementId);
  const attribution = readAttribution();
  window.gtag?.('event', eventName, { ...params, ...attribution, session_id: getOrCreateGa4SessionId() });
}

export function trackPageView(config: TrackingConfig, pageTitle?: string) {
  trackStoreEvent(config, 'page_view', { page_location: window.location.href, page_title: pageTitle || document.title });
}

export function trackProductView(config: TrackingConfig, item: { id: string; name: string; price?: number; currency?: string }) {
  trackStoreEvent(config, 'view_item', { currency: item.currency || 'GBP', value: item.price || 0, items: [{ item_id: item.id, item_name: item.name, price: item.price || 0 }] });
}

export function trackAddToCart(config: TrackingConfig, item: { id: string; name: string; price?: number; quantity?: number; currency?: string }) {
  trackStoreEvent(config, 'add_to_cart', { currency: item.currency || 'GBP', value: (item.price || 0) * (item.quantity || 1), items: [{ item_id: item.id, item_name: item.name, price: item.price || 0, quantity: item.quantity || 1 }] });
}

export function trackPurchase(config: TrackingConfig, order: { id: string; value: number; currency?: string; items?: unknown[] }) {
  trackStoreEvent(config, 'purchase', { transaction_id: order.id, currency: order.currency || 'GBP', value: order.value, items: order.items || [] });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __centralHubGtagLoaded?: string;
  }
}
