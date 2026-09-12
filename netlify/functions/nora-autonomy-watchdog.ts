import { createClient } from '@supabase/supabase-js';
import { runNoraAutonomy } from '../../lib/server/noraAutonomy';

export const config = {
  schedule: '*/5 * * * *',
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function noraAutonomyWatchdog() {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const serviceRoleKey = (
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'NORA autonomy watchdog configuration is missing.' }, 500);
  }

  try {
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result = await runNoraAutonomy(db, { source: 'scheduled' });
    return json(result as unknown as Record<string, unknown>, result.success ? 200 : 207);
  } catch (error: any) {
    return json({
      success: false,
      error: error?.message || 'NORA autonomy watchdog failed.',
    }, 500);
  }
}
