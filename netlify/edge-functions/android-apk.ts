const RELEASE_TAG = /^centralhub-android-v(.+)-c(\d+)$/i;
const RELEASES_URL = 'https://api.github.com/repos/tinuan96-svg/Centralhub0309-4/releases?per_page=20';

type GitHubAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubRelease = {
  tag_name?: string;
  draft?: boolean;
  assets?: GitHubAsset[];
};

async function findLatestApk(): Promise<{ name: string; url: string } | null> {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CentralHub-Android-Download',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) return null;

  const releases = await response.json() as GitHubRelease[];
  const candidates = (Array.isArray(releases) ? releases : [])
    .map((release) => {
      const match = String(release.tag_name || '').match(RELEASE_TAG);
      if (!match || release.draft) return null;
      const versionCode = Number(match[2]);
      const apk = (release.assets || []).find((asset) =>
        String(asset.name || '').toLowerCase().endsWith('.apk') && asset.browser_download_url
      );
      if (!Number.isFinite(versionCode) || !apk?.browser_download_url) return null;
      return {
        versionCode,
        name: String(apk.name || `centralhub-android-v${match[1]}.apk`),
        url: String(apk.browser_download_url),
      };
    })
    .filter(Boolean) as Array<{ versionCode: number; name: string; url: string }>;

  candidates.sort((a, b) => b.versionCode - a.versionCode);
  return candidates[0] || null;
}

export default async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const latest = await findLatestApk();
  if (!latest) return new Response('CentralHub Android APK is temporarily unavailable.', { status: 502 });

  const upstreamHeaders = new Headers({
    'User-Agent': 'CentralHub-Android-Download',
    Accept: 'application/vnd.android.package-archive,application/octet-stream;q=0.9,*/*;q=0.1',
  });
  const range = req.headers.get('range');
  if (range) upstreamHeaders.set('Range', range);

  const upstream = await fetch(latest.url, {
    method: req.method,
    headers: upstreamHeaders,
    redirect: 'follow',
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Could not retrieve the CentralHub Android APK.', { status: 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', `attachment; filename="${latest.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');

  for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(req.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
};

export const config = {
  path: '/downloads/centralhub-android-latest.apk',
};
