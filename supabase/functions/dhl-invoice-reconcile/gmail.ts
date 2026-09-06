import { adminDb, env, fromBase64Url } from './common.ts';
import { ingestCsv } from './reconcile.ts';

async function accessToken() {
  const clientId = env('DHL_GMAIL_CLIENT_ID'), clientSecret = env('DHL_GMAIL_CLIENT_SECRET'), refreshToken = env('DHL_GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('DHL Gmail OAuth is not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data?.error_description || data?.error || `Google token refresh failed (${res.status})`);
  return String(data.access_token);
}
async function gmailFetch(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`); if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { ...init, headers });
  const text = await res.text(); let data: any = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error?.message || `Gmail API ${res.status}`);
  return data;
}
function csvParts(part: any, out: any[] = []) {
  if (!part) return out;
  const filename = String(part.filename || ''), mime = String(part.mimeType || '').toLowerCase();
  if (filename.toLowerCase().endsWith('.csv') || mime === 'text/csv') out.push(part);
  for (const child of part.parts || []) csvParts(child, out);
  return out;
}
function isStatementCsv(filename: string) {
  return /__\d{8}\.csv$/i.test(filename);
}
async function partText(messageId: string, part: any, token: string) {
  if (part?.body?.data) return fromBase64Url(String(part.body.data));
  const attachmentId = part?.body?.attachmentId;
  if (!attachmentId) throw new Error('DHL CSV attachment id missing');
  const attachment = await gmailFetch(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, token);
  if (!attachment?.data) throw new Error('Gmail attachment returned no data');
  return fromBase64Url(String(attachment.data));
}

export async function scanRecent(days = 30) {
  const db = adminDb(), token = await accessToken(), mailbox = env('DHL_GMAIL_MAILBOX') || 'me';
  const sender = env('DHL_GMAIL_SENDER') || 'noreply@documents.dhlparcel.co.uk';
  const query = `from:${sender} filename:csv newer_than:${Math.max(1, Math.min(days, 365))}d`;
  const list = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=100`, token), processed: any[] = [];
  for (const item of list.messages || []) {
    const messageId = String(item.id || ''); if (!messageId) continue;
    const message = await gmailFetch(`/messages/${encodeURIComponent(messageId)}?format=full`, token);
    const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
    for (const part of csvParts(message.payload)) {
      const filename = String(part.filename || 'dhl-invoice.csv');
      if (isStatementCsv(filename)) {
        processed.push({ messageId, filename, skipped: true, reason: 'dhl_statement_csv' });
        continue;
      }
      const old = await db.from('dhl_invoice_imports').select('id,status').eq('gmail_message_id', messageId).eq('filename', filename).maybeSingle();
      if (old.data) { processed.push({ messageId, filename, duplicate: true, importId: old.data.id, status: old.data.status }); continue; }
      try {
        const result = await ingestCsv({ csv: await partText(messageId, part, token), filename, gmailMessageId: messageId, gmailAttachmentId: part?.body?.attachmentId || null, sourceMailbox: mailbox, receivedAt, metadata: { source: 'gmail', sender, gmail_thread_id: message.threadId || null } });
        processed.push({ messageId, filename, duplicate: !!result.duplicate, importId: result.import?.id, status: result.import?.status });
      } catch (error: any) {
        const errorMessage = String(error?.message || error || 'Unknown DHL invoice import error');
        if (/No DHL consignment charge rows found/i.test(errorMessage)) {
          processed.push({ messageId, filename, skipped: true, reason: 'no_consignment_rows' });
          continue;
        }
        console.error('[dhl-gmail-scan]', messageId, filename, errorMessage);
        processed.push({ messageId, filename, error: errorMessage.slice(0, 500) });
      }
    }
  }
  await db.from('dhl_gmail_watch_state').upsert({ mailbox, last_scan_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'mailbox' });
  return { query, messagesFound: (list.messages || []).length, attachmentsProcessed: processed.length, processed };
}

export async function setupWatch() {
  const topicName = env('DHL_GMAIL_PUBSUB_TOPIC'), mailbox = env('DHL_GMAIL_MAILBOX') || 'me';
  if (!topicName) throw new Error('DHL_GMAIL_PUBSUB_TOPIC is not configured');
  const token = await accessToken();
  const watch = await gmailFetch('/watch', token, { method: 'POST', body: JSON.stringify({ topicName, labelIds: ['INBOX'] }) });
  const expiration = watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null;
  await adminDb().from('dhl_gmail_watch_state').upsert({ mailbox, history_id: watch.historyId ? String(watch.historyId) : null, watch_expiration: expiration, last_error: null, metadata: { topic_name: topicName }, updated_at: new Date().toISOString() }, { onConflict: 'mailbox' });
  return { mailbox, historyId: watch.historyId || null, expiration, topicName };
}
