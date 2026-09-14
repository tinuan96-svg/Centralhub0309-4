import { createClient } from '@supabase/supabase-js';
import { runShruthiLearning } from '../../lib/server/shruthiLearning';

export const config = {
  schedule: '17 */6 * * *',
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function shruthiLearningWatchdog() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: 'Shruthi Learning database configuration is missing.' }, 500);

  try {
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await runShruthiLearning(db, { source: 'scheduled' });
    return json(result as Record<string, unknown>, result.success ? 200 : 207);
  } catch (error: any) {
    return json({ success: false, error: error?.message || 'Shruthi Learning watchdog failed.' }, 500);
  }
}
