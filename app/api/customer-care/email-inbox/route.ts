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
    const { data, error } = await admin.from('email_hub_messages')
      .select('id,source_provider,source_account,external_message_id,external_thread_id,store_id,from_address,to_addresses,subject,body_text,attachments,received_at,category,subcategory,priority,ai_summary,action_summary,detected_deadline,detected_amount,detected_currency,sender_verified,confidence,route_status,route_target,linked_entity_type,linked_entity_id,requires_human_approval,processing_error')
      .order('received_at', { ascending: false }).limit(200);
    if (error) return fail(503, 'Email inbox is temporarily unavailable');
    return NextResponse.json({ messages: data || [], sending_enabled: false, automatic_replies_enabled: false, intelligence_hub_enabled: true },
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
    const state = input.route_status;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
       !['pending','routed','needs_review','processed','failed','ignored'].includes(String(state))) {
      return fail(400, 'Invalid message or state');
    }
    const { data, error } = await admin.from('email_hub_messages')
      .update({ route_status: state, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,route_status').maybeSingle();
    if (error) return fail(503, 'Unable to update message');
    if (!data) return fail(404, 'Email not found');
    return NextResponse.json({ message: data }, { headers: noCache });
  } catch (error) {
    return error instanceof AccessDenied ? fail(error.status, error.message) : fail(503, 'Unable to update message');
  }
}
