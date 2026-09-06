export type Attribution = {
  source: string;
  medium: string;
  campaign?: string;
  campaignId?: string;
  content?: string;
  term?: string;
  referrer?: string;
  clickId?: string;
  clickIdType?: 'gclid' | 'gbraid' | 'wbraid' | 'fbclid' | 'ttclid';
};

const KEY = 'ch_analytics_first_touch';
const LAST_KEY = 'ch_analytics_last_touch';

const SEARCH = new Set(['google','bing','yahoo','duckduckgo','ecosia','baidu','yandex']);
const SOCIAL: Record<string, string> = {
  facebook: 'facebook', 'instagram': 'instagram', 'tiktok': 'tiktok',
  youtube: 'youtube', 'pinterest': 'pinterest', 'linkedin': 'linkedin',
  reddit: 'reddit', 'twitter': 'x', 'x.com': 'x', 'whatsapp': 'whatsapp',
  telegram: 'telegram',
};

function hostname(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export function classifyCurrentVisit(urlString = typeof window !== 'undefined' ? window.location.href : '', referrer = typeof document !== 'undefined' ? document.referrer : ''): Attribution {
  const url = new URL(urlString || 'https://example.invalid');
  const p = url.searchParams;
  const refHost = hostname(referrer);
  const sourceParam = p.get('utm_source')?.trim().toLowerCase();
  const mediumParam = p.get('utm_medium')?.trim().toLowerCase();
  const campaign = p.get('utm_campaign') || undefined;
  const campaignId = p.get('utm_id') || undefined;
  const content = p.get('utm_content') || undefined;
  const term = p.get('utm_term') || undefined;
  const clickIds: Array<[string, Attribution['clickIdType']]> = [
    ['gclid','gclid'], ['gbraid','gbraid'], ['wbraid','wbraid'], ['fbclid','fbclid'], ['ttclid','ttclid'],
  ];
  const found = clickIds.find(([key]) => p.get(key));

  if (sourceParam || mediumParam || found) {
    const source = sourceParam || (found?.[1] === 'fbclid' ? 'facebook' : found?.[1] === 'ttclid' ? 'tiktok' : 'google');
    return { source, medium: mediumParam || 'paid', campaign, campaignId, content, term, referrer: referrer || undefined, clickId: found ? p.get(found[0]) || undefined : undefined, clickIdType: found?.[1] };
  }

  if (!refHost) return { source: 'direct', medium: 'none' };
  const refParts = refHost.split('.');
  const base = refParts.length >= 2 ? refParts.slice(-2).join('.') : refHost;
  if (SEARCH.has(base)) return { source: base, medium: 'organic', referrer };
  const social = SOCIAL[base] || SOCIAL[refHost];
  if (social) return { source: social, medium: 'social', referrer };
  return { source: base, medium: 'referral', referrer };
}

export function persistAttribution(current: Attribution) {
  if (typeof window === 'undefined') return;
  const first = window.localStorage.getItem(KEY);
  if (!first) window.localStorage.setItem(KEY, JSON.stringify(current));
  window.localStorage.setItem(LAST_KEY, JSON.stringify(current));
}

export function getStoredAttribution(): { firstTouch?: Attribution; lastTouch?: Attribution } {
  if (typeof window === 'undefined') return {};
  const parse = (key: string) => {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null') as Attribution | null; } catch { return null; }
  };
  return { firstTouch: parse(KEY) || undefined, lastTouch: parse(LAST_KEY) || undefined };
}
