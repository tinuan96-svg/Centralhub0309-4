export type Acquisition = {
  source: string;
  medium: string;
  campaign?: string;
  campaignId?: string;
  content?: string;
  term?: string;
  referrer?: string;
  clickId?: string;
};

const SOCIAL = new Set(['facebook.com','instagram.com','l.instagram.com','l.facebook.com','tiktok.com','youtube.com','youtu.be','pinterest.com','linkedin.com','x.com','twitter.com','reddit.com']);
const SEARCH = new Set(['google.com','www.google.com','bing.com','www.bing.com','search.yahoo.com','duckduckgo.com','ecosia.org','yandex.com','baidu.com']);

export function classifyAcquisition(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmId?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  referrer?: string | null;
  clickIds?: Partial<Record<'gclid'|'gbraid'|'wbraid'|'fbclid'|'ttclid', string | null>>;
}): Acquisition {
  const source = input.utmSource?.trim();
  const medium = input.utmMedium?.trim();
  const referrer = input.referrer || undefined;

  if (source || medium) {
    return {
      source: source || 'unknown',
      medium: medium || 'unknown',
      campaign: input.utmCampaign || undefined,
      campaignId: input.utmId || undefined,
      content: input.utmContent || undefined,
      term: input.utmTerm || undefined,
      referrer,
      clickId: input.clickIds?.gclid || input.clickIds?.gbraid || input.clickIds?.wbraid || input.clickIds?.fbclid || input.clickIds?.ttclid || undefined,
    };
  }

  if (!referrer) return { source: '(direct)', medium: '(none)' };

  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (SEARCH.has(host)) return { source: host.split('.')[0], medium: 'organic', referrer };
    if (SOCIAL.has(host)) return { source: host.split('.')[0], medium: 'social', referrer };
    return { source: host, medium: 'referral', referrer };
  } catch {
    return { source: 'unknown', medium: 'referral', referrer };
  }
}
