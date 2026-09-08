import { adminDb, configStatus, cors, env, fromBase64Url, reply, requireAdmin, secureEqual } from './common.ts';
import { ingestCsv, retryUnmatched } from './reconcile.ts';
import { scanRecent, setupWatch } from './gmail.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors });
  const url = new URL(req.url), pathAction = url.pathname.split('/').filter(Boolean).pop() || '';
  try {
    if (req.method === 'POST' && (pathAction === 'webhook' || url.searchParams.get('action') === 'webhook')) {
      const supplied = url.searchParams.get('token') || req.headers.get('x-dhl-gmail-secret') || '';
      if (!secureEqual(supplied, env('DHL_GMAIL_WEBHOOK_SECRET'))) return reply({ error: 'Invalid DHL Gmail webhook secret' }, 401);
      const body = await req.json().catch(() => ({}));
      let notification: any = {};
      try { notification = body?.message?.data ? JSON.parse(fromBase64Url(String(body.message.data))) : {}; } catch { notification = {}; }
      const mailbox = String(notification?.emailAddress || env('DHL_GMAIL_MAILBOX') || 'me'), db = adminDb();
      await db.from('dhl_gmail_watch_state').upsert({ mailbox, history_id: notification?.historyId ? String(notification.historyId) : null, last_notification_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'mailbox' });
      try { return reply({ success: true, notification, scan: await scanRecent(30), retry: await retryUnmatched(250) }); }
      catch (error: any) {
        await db.from('dhl_gmail_watch_state').upsert({ mailbox, last_error: String(error?.message || error).slice(0, 2000), updated_at: new Date().toISOString() }, { onConflict: 'mailbox' });
        throw error;
      }
    }

    await requireAdmin(req);
    if (req.method === 'GET') {
      const watch = await adminDb().from('dhl_gmail_watch_state').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      return reply({ success: true, config: configStatus(), watch: watch.data || null });
    }
    if (req.method !== 'POST') return reply({ error: 'Use GET or POST' }, 405);
    const body = await req.json().catch(() => ({})), action = String(body?.action || 'scan_recent');
    if (action === 'ingest_csv') return reply(await ingestCsv(body));
    if (action === 'scan_recent') return reply({ success: true, ...(await scanRecent(Number(body.days || 30))) });
    if (action === 'retry_unmatched') return reply({ success: true, ...(await retryUnmatched(Number(body.limit || 250))) });
    if (action === 'setup_watch' || action === 'renew_watch') {
      const watch = await setupWatch();
      return reply({ success: true, watch, scan: action === 'setup_watch' ? await scanRecent(Number(body.days || 30)) : null, retry: await retryUnmatched(Number(body.limit || 250)) });
    }
    return reply({ error: `Unknown action: ${action}`, available: ['ingest_csv', 'scan_recent', 'retry_unmatched', 'setup_watch', 'renew_watch'], config: configStatus() }, 400);
  } catch (error: any) {
    const message = String(error?.message || error || 'Unknown error');
    console.error('[dhl-invoice-reconcile]', message);
    return reply({ success: false, error: message, config: configStatus() }, /Authorization|required|Invalid session|Admin access/.test(message) ? 401 : /not configured|Missing/.test(message) ? 503 : 500);
  }
});
