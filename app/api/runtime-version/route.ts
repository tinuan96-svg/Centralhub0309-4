export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const candidates: Array<[string, string | undefined]> = [
    ['netlify_commit', process.env.COMMIT_REF],
    ['netlify_deploy', process.env.DEPLOY_ID],
    ['vercel_commit', process.env.VERCEL_GIT_COMMIT_SHA],
    ['build_commit', process.env.NEXT_PUBLIC_GIT_COMMIT_SHA],
  ];

  const selected = candidates.find(([, value]) => Boolean(value?.trim()));
  const version = selected?.[1]?.trim() || null;

  return Response.json(
    {
      version,
      tracked: Boolean(version),
      source: selected?.[0] || 'unavailable',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    },
  );
}
