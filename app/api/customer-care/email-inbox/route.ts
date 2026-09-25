import { NextResponse } from 'next/server';
import { AccessDenied, requireVerifiedSuperAdmin } from '@/lib/access-control/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noCache = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noCache });

/** Only current, active verified CentralHub Super Admin may read private email.
 * No query, HTML rendering, automated reply, or client-side service-role access.
 */
export async function GET(request: Request) {
  try {
    const { admin } = await requireVerifiedSuperAdmin(request);
    const { data, error } = await admin.from('centralhub_resend_inbound')
      .select('resend_email_id,message_id,from_address,to_addresses,subject,body_text,attachments,received_at,processing_state')
      .order('received_at', { ascending: false }).limit(100);
    if (error) return fail(503, 'Email inbox is temporarily unavailable');
    return NextResponse.json({ messages: data || [], sending_enabled: false, automatic_replies_enabled: false },
      { headers: noCache });
  } catch (error) {
    return error instanceof AccessDenied ? fail(error.status, error.message) : fail(503, 'Email inbox is temporarily unavailable');
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await requireVerifiedSuperAdmin(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail(400, 'Invalid request');
    const input = body as Record<string, unknown>;
    const id = input.id;
    const state = input.processing_state;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(id) ||
       (state !== 'unread' && state !== 'reviewed' && state !== 'archived')) {
      return fail(400, 'Invalid message or state');
    }
    const { data, error } = await admin.from('centralhub_resend_inbound')
      .update({ processing_state: state })
      .eq('resend_email_id', id)
      .select('resend_email_id,processing_state').maybeSingle();
    if (error) return fail(503, 'Unable to update message');
    if (!data) return fail(404, 'Email not found');
    return NextResponse.json({ message: data }, { headers: noCache });
  } catch (error) {
    return error instanceof AccessDenied ? fail(error.status, error.message) : fail(503, 'Unable to update message');
  }
}
