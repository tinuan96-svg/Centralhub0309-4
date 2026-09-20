import { NextResponse } from 'next/server';
import { getServiceClient, getUserFromRequest } from '@/app/api/push/_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Authorization' };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status, headers: privateHeaders });
}

/** Read-only migration registry. No source writes, deployment, or domain actions. */
export async function GET(request: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') return errorResponse('Unavailable in static export.', 404);
  const { user } = await getUserFromRequest(request);
  if (!user) return errorResponse('Authentication required.', 401);
  // app_metadata is assigned server-side by Supabase Auth; user_metadata is not trusted.
  if (user.app_metadata?.role !== 'admin') return errorResponse('Administrator access required.', 403);

  try {
    const db = getServiceClient();
    const [projectsResult, settingsResult] = await Promise.all([
      db.from('tinu_cloud_projects')
        .select('id,name,slug,production_domain,current_host,target_host,migration_status,live_actions_enabled')
        .order('name'),
      db.from('tinu_cloud_settings')
        .select('stage,source_writes_enabled,deployments_enabled,domain_cutover_enabled')
        .eq('singleton', true).maybeSingle(),
    ]);
    if (projectsResult.error || settingsResult.error || !settingsResult.data) {
      return errorResponse('Tinu Cloud configuration is unavailable.', 503);
    }
    return NextResponse.json({
      success: true,
      projects: projectsResult.data,
      settings: settingsResult.data,
    }, { headers: privateHeaders });
  } catch {
    return errorResponse('Tinu Cloud service is not configured.', 503);
  }
}
