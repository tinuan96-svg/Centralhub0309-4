import { NextResponse } from 'next/server';
import { getUserFromRequest, jsonError } from '../push/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RELEASE_TAG = /^centralhub-android-v(.+)-c(\d+)$/i;
const RELEASES_URL = 'https://api.github.com/repos/tinuan96-svg/Centralhub0309-4/releases?per_page=20';
const CENTRALHUB_APK_URL = 'https://centralhub.network/downloads/centralhub-android-latest.apk';

type GitHubAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubAsset[];
};

export async function GET(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const { user, error: authError } = await getUserFromRequest(req);
  if (authError || !user) return jsonError(authError || 'Unauthorized', 401);

  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CentralHub-App-Update-Feed',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return jsonError(`GitHub update feed returned HTTP ${response.status}.`, 502);
    }

    const releases = await response.json() as GitHubRelease[];
    const candidates = (Array.isArray(releases) ? releases : [])
      .map((release) => {
        const match = String(release.tag_name || '').match(RELEASE_TAG);
        if (!match || release.draft) return null;
        const versionCode = Number(match[2]);
        const apk = (release.assets || []).find((asset) => String(asset.name || '').toLowerCase().endsWith('.apk') && asset.browser_download_url);
        if (!Number.isFinite(versionCode) || !apk?.browser_download_url) return null;
        return {
          versionName: match[1],
          versionCode,
          tag: String(release.tag_name),
          publishedAt: release.published_at || null,
          downloadUrl: CENTRALHUB_APK_URL,
          releaseUrl: String(release.html_url || ''),
          notes: String(release.body || '').slice(0, 1200),
        };
      })
      .filter(Boolean) as Array<{
        versionName: string;
        versionCode: number;
        tag: string;
        publishedAt: string | null;
        downloadUrl: string;
        releaseUrl: string;
        notes: string;
      }>;

    candidates.sort((a, b) => b.versionCode - a.versionCode);

    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      latest: candidates[0] || null,
      policy: {
        liveWebChangesRequireApk: false,
        nativeAndroidChangesRequireApk: true,
      },
    });
  } catch (error: any) {
    return jsonError(error?.message || 'Could not read the CentralHub Android update feed.', 500);
  }
}
