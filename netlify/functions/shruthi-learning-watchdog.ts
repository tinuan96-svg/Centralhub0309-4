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

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Shruthi Learning scheduler configuration is missing.' }, 500);
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/shruthi-continuous-learning`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source: 'scheduled' }),
    });
    const result = await response.json().catch(() => ({ success: false, error: `Learning worker returned HTTP ${response.status}` }));
    return json(result as Record<string, unknown>, response.ok ? 200 : 207);
  } catch (error: any) {
    return json({ success: false, error: error?.message || 'Shruthi Learning watchdog failed.' }, 500);
  }
}
